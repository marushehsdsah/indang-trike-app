const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config({ path: path.join(__dirname, '.env') });

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error('MONGODB_URI is missing from backend/.env');
}

const app = express();

app.use(express.json());
app.use(cors());

// 1. Connect each account type to its own database using backend/.env
const passengerDb = mongoose.createConnection(mongoUri, { dbName: 'passenger' });
const driverDb = mongoose.createConnection(mongoUri, { dbName: 'driver' });

passengerDb.once('open', () => console.log('Connected to passenger database!'));
driverDb.once('open', () => console.log('Connected to driver database!'));
passengerDb.on('error', err => console.error('Passenger database connection error:', err));
driverDb.on('error', err => console.error('Driver database connection error:', err));

// 2. Create the User Database Table (Schema)
const UserSchema = new mongoose.Schema({
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['passenger', 'driver'], required: true },
    todaNumber: { type: String, trim: true },
    plateNumber: { type: String, trim: true }
});
const Passenger = passengerDb.model('User', UserSchema, 'users');
const Driver = driverDb.model('User', UserSchema, 'users');

// 3. REGISTER API
app.post('/api/register', async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            password,
            role,
            todaNumber,
            plateNumber
        } = req.body;

        if (!firstName || !lastName || !email || !phone || !password || !role) {
            return res.status(400).json({ error: 'Please complete all required fields' });
        }

        if (!['passenger', 'driver'].includes(role)) {
            return res.status(400).json({ error: 'Invalid account role' });
        }

        if (role === 'driver' && (!todaNumber || !plateNumber)) {
            return res.status(400).json({ error: 'Driver vehicle details are required' });
        }
        
        const User = role === 'driver' ? Driver : Passenger;

        // Check for duplicates within the selected account database.
        const existingUser = await User.findOne({ $or: [{ phone }, { email }] });
        if (existingUser) return res.status(400).json({ error: 'Phone number or email already registered' });

        // Scramble the password securely
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Save to Database
        const newUser = new User({
            firstName,
            lastName,
            email,
            phone,
            password: hashedPassword,
            role,
            todaNumber: role === 'driver' ? todaNumber : undefined,
            plateNumber: role === 'driver' ? plateNumber : undefined
        });
        await newUser.save();

        res.status(201).json({ message: 'Account created successfully!', role });
    } catch (error) {
        console.error('❌ Registration error:', error);
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Phone number or email already registered' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

// 4. LOGIN API
app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        // A login can belong to either account database.
        const user = await Passenger.findOne({ phone }) || await Driver.findOne({ phone });
        if (!user) return res.status(404).json({ error: 'Account not found' });

        // Check if password matches
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid password' });

        res.json({
            message: 'Login successful!',
            role: user.role,
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                gender: 'Male'
            }
        });
    } catch (error) {
        console.error(' Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// 5. Attach Socket.IO to the same HTTP server as the REST API.
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: 'http://192.168.1.3:3000',
        methods: ['GET', 'POST']
    }
});

const rideQueue = new Map();

const broadcastQueue = () => {
    io.to('drivers').emit('ride:queue:update', Array.from(rideQueue.values()));
};

io.on('connection', (socket) => {
    const { role, userId } = socket.handshake.auth || {};

    if (role === 'driver') socket.join('drivers');
    if (userId) socket.join(`user:${userId}`);
    if (role === 'driver') socket.emit('ride:queue:update', Array.from(rideQueue.values()));

    socket.on('ride:request', (ride, acknowledge) => {
        const request = {
            ...ride,
            id: ride.id || `${Date.now()}-${socket.id}`,
            passengerId: ride.passengerId || userId,
            status: 'searching',
            createdAt: new Date().toISOString()
        };

        rideQueue.set(request.id, request);
        io.to('drivers').emit('ride:request', request);
        broadcastQueue();
        if (typeof acknowledge === 'function') acknowledge({ ok: true, ride: request });
    });

    socket.on('ride:accept', ({ rideId, driverId, driverName } = {}, acknowledge) => {
        const ride = rideQueue.get(rideId);
        if (!ride) {
            if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Ride is no longer available' });
            return;
        }

        const acceptedRide = { ...ride, driverId: driverId || userId, driverName, status: 'accepted' };
        rideQueue.delete(rideId);
        io.to(`user:${ride.passengerId}`).emit('ride:accepted', acceptedRide);
        broadcastQueue();
        if (typeof acknowledge === 'function') acknowledge({ ok: true, ride: acceptedRide });
    });

    socket.on('ride:decline', ({ rideId } = {}) => {
        socket.to('drivers').emit('ride:declined', { rideId });
    });

    socket.on('ride:cancel', ({ rideId } = {}) => {
        const ride = rideQueue.get(rideId);
        if (!ride) return;

        rideQueue.delete(rideId);
        io.to('drivers').emit('ride:cancelled', { rideId });
        broadcastQueue();
    });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend and Socket.IO server running on port ${PORT}`);
}); 
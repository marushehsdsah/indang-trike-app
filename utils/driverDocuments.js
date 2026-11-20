// The photos a tricycle driver signs up with, for an admin to check them
// against their TODA's records before approving them, in the order the screens
// show them. The app sends each one as a JPEG data URL in `documents` on
// POST /api/register; the server keeps them in the DriverDocument collection.
const DRIVER_DOCUMENTS = ['license', 'registration', 'franchise'];

// What each photo shows, as the admin screens name it.
const DOCUMENT_LABELS = {
  license: 'Driver’s license',
  registration: 'Registration (OR/CR)',
  franchise: 'Franchise (MTOP)',
};

// The form's message when a photo is missing; the server sends the same one.
const DOCUMENT_MISSING = {
  license: 'Add a photo of your driver’s license.',
  registration: 'Add a photo of your tricycle’s registration (OR/CR).',
  franchise: 'Add a photo of your franchise (MTOP) showing the franchise number.',
};

// A document photo must stay readable, so it is larger than a profile picture.
// The app makes it smaller until it fits (components/pickPhoto.js).
const MAX_DOCUMENT_BYTES = 400 * 1024;

// The first photo `documents` ({ license, registration, franchise }) lacks, or null.
function missingDocument(documents) {
  return DRIVER_DOCUMENTS.find((kind) => !documents?.[kind]) ?? null;
}

module.exports = { DRIVER_DOCUMENTS, DOCUMENT_LABELS, DOCUMENT_MISSING, MAX_DOCUMENT_BYTES, missingDocument };

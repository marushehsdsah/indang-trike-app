import React from 'react';
import { Avatar } from './ui/Surfaces';
import { useApp } from '../context/AppContext';
import { API_BASE_URL } from '../services/api';
import { userName } from '../utils/rideState';

// The address of a person's profile picture, or null without one. photoAt is
// in the address, so a new picture replaces the cached one.
export function photoUri(person) {
  return person?.id && person.photoAt ? `${API_BASE_URL}/api/users/${person.id}/photo?v=${person.photoAt}` : null;
}

// A person's avatar: their profile picture when they have one (the server
// shows it only to those who may see it), otherwise their initials.
export default function UserAvatar({ person, size, style }) {
  const { token } = useApp();
  const uri = photoUri(person);
  return <Avatar name={userName(person ?? {})} size={size} style={style}
    source={uri && token ? { uri, headers: { Authorization: `Bearer ${token}` } } : null} />;
}

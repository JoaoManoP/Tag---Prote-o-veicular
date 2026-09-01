import type { MapPoint } from '../components/RastreonMap';

export type ConvoyMember = {
  userId: number;
  name: string;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
  lastSeenAt?: number | null;
};

export type ConvoyPosition = {
  userId: number;
  name: string;
  latitude: number;
  longitude: number;
  heading?: number | null;
  timestamp: number;
};

export type ConvoyState = {
  enabled: boolean;
  profile: { userId: number; name: string; contactId: string };
  connections: {
    id: string;
    status: string;
    requesterId: number;
    userId: number;
    name: string;
    contactId: string;
  }[];
  invites: { id: string; ownerName: string; expiresAt: number }[];
  convoy: null | {
    id: string;
    ownerId: number;
    destinationLabel?: string | null;
    routeLabel?: string | null;
    members: ConvoyMember[];
  };
};

export function updateConvoyPosition(state: ConvoyState, position: ConvoyPosition): ConvoyState {
  if (!state.convoy) return state;
  return {
    ...state,
    convoy: {
      ...state.convoy,
      members: state.convoy.members.map(member =>
        member.userId === position.userId
          ? {
              ...member,
              name: position.name || member.name,
              latitude: position.latitude,
              longitude: position.longitude,
              lastSeenAt: position.timestamp
            }
          : member
      )
    }
  };
}

export function convoyMapPoints(state?: ConvoyState): MapPoint[] {
  if (!state?.convoy) return [];
  return state.convoy.members
    .filter(
      member =>
        member.userId !== state.profile.userId &&
        Number.isFinite(member.latitude) &&
        Number.isFinite(member.longitude)
    )
    .map(member => ({
      id: `convoy-${member.userId}`,
      latitude: Number(member.latitude),
      longitude: Number(member.longitude),
      kind: 'convoy',
      label: member.name
    }));
}

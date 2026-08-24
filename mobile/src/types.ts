export type User={id:number;name:string;email:string;phone?:string;createdAt?:number};
export type VehicleImage={url:string;source?:string;author?:string;license?:string;attribution?:string};
export type Vehicle={id:number;nickname:string;type:'car'|'motorcycle';plate:string;brand:string;model:string;year?:number;manufactureYear?:number;version?:string;color?:string;engine?:string;transmission?:string;fuel?:string;city?:number;road?:number;tank?:number;image?:VehicleImage;selected:boolean};
export type Position={latitude:number;longitude:number;accuracy:number;speed?:number|null;heading?:number|null;altitude?:number|null;timestamp:number;source?:string;sequence?:number;capturedOffline?:boolean;deviceId?:string;eventId?:string};
export type TrackingSession={id:string;closed:boolean;phoneConnected:boolean;positions:Position[];vehicle?:Vehicle;pairingId?:string;qrCode?:string;pairingCode?:string;pairingExpiresAt?:number};
export type Trip={id:string;vehicleId:number;trackingSessionId:string;startedAt:number;endedAt?:number;plannedRoute?:Record<string,unknown>;comparison?:Record<string,number>;actualTrack?:Position[]};
export type Geofence={id:string;vehicleId:number;name:string;type:'circle'|'polygon';centerLat:number;centerLng:number;radiusMeters:number;enabled:boolean};
export type Alert={id:string;vehicleId?:number;type:string;severity:string;title:string;occurredAt:number;readAt?:number};

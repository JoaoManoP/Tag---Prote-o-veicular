import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { enqueuePosition } from './offlineQueue';
const TASK='rastreon-authorized-vehicle-location';
TaskManager.defineTask(TASK,async({data,error})=>{if(error)return;const locations=(data as {locations?:Location.LocationObject[]})?.locations||[];for(const value of locations){const timestamp=value.timestamp||Date.now();await enqueuePosition({latitude:value.coords.latitude,longitude:value.coords.longitude,accuracy:value.coords.accuracy||0,speed:value.coords.speed,heading:value.coords.heading,altitude:value.coords.altitude,timestamp,sequence:timestamp,eventId:`background:${timestamp}`,capturedOffline:true})}});
export async function startBackgroundLocation(){if(await Location.hasStartedLocationUpdatesAsync(TASK))return;await Location.startLocationUpdatesAsync(TASK,{accuracy:Location.Accuracy.High,distanceInterval:10,timeInterval:10000,pausesUpdatesAutomatically:false,showsBackgroundLocationIndicator:true,foregroundService:{notificationTitle:'RASTREON protegendo sua viagem',notificationBody:'Compartilhamento de localização ativo. Toque para abrir.',notificationColor:'#FFC400'}})}
export async function stopBackgroundLocation(){if(await Location.hasStartedLocationUpdatesAsync(TASK))await Location.stopLocationUpdatesAsync(TASK)}

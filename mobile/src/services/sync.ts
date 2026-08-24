import { confirmSequences, listQueue, type QueueState } from './offlineQueue';
import { socketService } from './socket';
export async function syncPositions(onState?:(state:QueueState)=>void){const points=await listQueue();if(!points.length){onState?.('synced');return 0}onState?.('syncing');try{const result=await socketService.sendBatch(points,points[0].timestamp);if(!result.ok)throw new Error(result.error);await confirmSequences(result.confirmedSequences||[]);onState?.('synced');return result.confirmedSequences?.length||0}catch(error){onState?.('failed');throw error}}

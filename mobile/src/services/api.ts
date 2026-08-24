const API_URL=(process.env.EXPO_PUBLIC_API_URL||'http://localhost:3000').replace(/\/$/,'');
export class ApiError extends Error{constructor(message:string,public status:number,public code?:string){super(message)}}
async function request<T>(path:string,options:RequestInit={}){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch(`${API_URL}${path}`,{...options,signal:controller.signal,credentials:'include',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  if(response.status===204)return undefined as T;
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new ApiError(data.error||'Não foi possível concluir agora.',response.status,data.code);
  return data as T;
 }catch(error){
  if(error instanceof Error&&error.name==='AbortError')throw new ApiError('A API demorou para responder. Verifique a conexão.',408,'API_TIMEOUT');
  throw error;
 }finally{clearTimeout(timeout)}
}
export const api={
 get:<T>(path:string)=>request<T>(path),post:<T>(path:string,body?:unknown)=>request<T>(path,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)}),put:<T>(path:string,body:unknown)=>request<T>(path,{method:'PUT',body:JSON.stringify(body)}),patch:<T>(path:string,body:unknown)=>request<T>(path,{method:'PATCH',body:JSON.stringify(body)}),delete:<T>(path:string,headers?:Record<string,string>,body?:unknown)=>request<T>(path,{method:'DELETE',headers,body:body?JSON.stringify(body):undefined}),
 url:(path:string)=>`${API_URL}${path}`
};

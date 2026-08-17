'use strict';

(function exposeNavigation(){
  const radians=value=>value*Math.PI/180;
  const distance=(a,b)=>{const dLat=radians(b.latitude-a.latitude),dLng=radians(b.longitude-a.longitude),q=Math.sin(dLat/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dLng/2)**2;return 6371000*2*Math.asin(Math.sqrt(q))};
  const bearing=(a,b)=>(Math.atan2(Math.sin(radians(b.longitude-a.longitude))*Math.cos(radians(b.latitude)),Math.cos(radians(a.latitude))*Math.sin(radians(b.latitude))-Math.sin(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.cos(radians(b.longitude-a.longitude)))*180/Math.PI+360)%360;
  const maneuverIcon={left:'↰',right:'↱',roundabout:'⟳',uturn:'↶',arrive:'●',depart:'↑',merge:'↗',fork:'⑂',straight:'↑'};
  const formatDistance=meters=>meters<1000?`${Math.max(0,Math.round(meters))} m`:`${(Math.max(0,meters)/1000).toFixed(1).replace('.',',')} km`;

  class VehiclePositionInterpolator{
    constructor(){this.frame=null}
    move(marker,from,to,duration=650){
      cancelAnimationFrame(this.frame);
      const heading=Number.isFinite(to.heading)?to.heading:(from?bearing(from,to):0);
      marker.setHeading?.(heading);
      const element=marker.getElement?.()?.querySelector('.vehicle-marker-body')||marker.getElement?.();
      if(element)element.style.transform=`rotate(${heading}deg)`;
      if(!from){marker.setLatLng([to.latitude,to.longitude]);return}
      const started=performance.now(),animate=now=>{const progress=Math.min(1,(now-started)/duration),eased=1-(1-progress)**3,latitude=from.latitude+(to.latitude-from.latitude)*eased,longitude=from.longitude+(to.longitude-from.longitude)*eased;marker.setLatLng([latitude,longitude]);if(progress<1)this.frame=requestAnimationFrame(animate)};
      this.frame=requestAnimationFrame(animate);
    }
  }

  class NavigationStateService{
    constructor({map,container}){
      this.map=map;this.route=null;this.active=false;this.follow=true;this.stepIndex=0;this.traveled=0;this.interpolator=new VehiclePositionInterpolator();
      container.insertAdjacentHTML('beforeend',`<section id="navigationHud" class="navigation-hud hidden" aria-live="polite"><div class="next-maneuver"><span id="navManeuver">↑</span><div><strong id="navDistance">—</strong><span id="navInstruction">Continue na rota</span><small id="navStreet"></small></div></div><div class="navigation-bottom"><div class="speed-orb"><strong id="navSpeed">0</strong><span>km/h</span></div><div class="road-now"><span>VIA ATUAL</span><strong id="navRoad">Rota planejada</strong></div><div class="eta-block"><strong id="navEta">—</strong><span id="navRemaining">—</span></div></div><div class="navigation-controls"><button id="navPerspective" type="button" aria-pressed="false">Perspectiva</button><button id="navRoadEvents" type="button" aria-pressed="false">Radares</button><button id="nav2d" type="button">2D</button><button id="navRecenter" type="button">◎ Centralizar</button></div></section>`);
      this.hud=document.getElementById('navigationHud');
      document.getElementById('navRecenter').onclick=()=>{this.follow=true;this.lastPosition&&this.center(this.lastPosition);document.getElementById('navRecenter').classList.remove('attention')};
      document.getElementById('navPerspective').onclick=event=>{const enabled=event.currentTarget.getAttribute('aria-pressed')!=='true';event.currentTarget.setAttribute('aria-pressed',String(enabled));this.map.setTilt?.(enabled?55:0)};
      document.getElementById('navRoadEvents').onclick=event=>{const enabled=event.currentTarget.getAttribute('aria-pressed')!=='true';event.currentTarget.setAttribute('aria-pressed',String(enabled));window.dispatchEvent(new CustomEvent('rastreon:road-events-toggle',{detail:{enabled}}))};
      document.getElementById('nav2d').onclick=()=>{this.map.setTilt?.(0);this.map.setHeading?.(0)};
      this.map.on('dragstart',()=>{if(!this.active)return;this.follow=false;document.getElementById('navRecenter').classList.add('attention')});
    }
    setRoute(route,destination='Destino'){this.route=route;this.destination=destination;this.stepIndex=0;this.traveled=0;this.render()}
    start(){if(!this.route)return;this.active=true;this.follow=true;this.hud.classList.remove('hidden');document.body.classList.add('navigation-active');this.render()}
    stop(){this.active=false;this.hud.classList.add('hidden');document.body.classList.remove('navigation-active')}
    center(position){this.map.panTo?this.map.panTo([position.latitude,position.longitude]):this.map.setView([position.latitude,position.longitude],Math.max(16,this.map.getZoom()))}
    update(position,speedKmh,traveledMeters){
      this.lastPosition=position;this.traveled=traveledMeters||0;
      const steps=this.route?.steps||[];let step=steps[this.stepIndex];
      while(step?.location&&distance(position,step.location)<35&&this.stepIndex<steps.length-1)step=steps[++this.stepIndex];
      document.getElementById('navSpeed').textContent=Math.round(speedKmh||0);
      if(step?.location)document.getElementById('navDistance').textContent=formatDistance(distance(position,step.location));
      if(this.follow&&this.active)this.center(position);
      this.render();
    }
    render(){
      if(!this.route)return;const step=this.route.steps?.[this.stepIndex],remaining=Math.max(0,(this.route.distance||this.route.distanceMeters||0)-this.traveled),duration=(this.route.duration||this.route.durationSeconds||0)*(remaining/Math.max(1,this.route.distance||this.route.distanceMeters||1));
      document.getElementById('navManeuver').textContent=maneuverIcon[step?.maneuver]||'↑';
      document.getElementById('navInstruction').textContent=step?.instruction||'Continue pela rota destacada';
      document.getElementById('navStreet').textContent=step?.street||this.destination||'';
      document.getElementById('navRoad').textContent=step?.street||'Rota planejada';
      document.getElementById('navEta').textContent=new Date(Date.now()+duration*1000).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      document.getElementById('navRemaining').textContent=`${formatDistance(remaining)} · ${Math.max(1,Math.round(duration/60))} min`;
    }
  }

  window.NavigationStateService=NavigationStateService;
  window.VehiclePositionInterpolator=VehiclePositionInterpolator;
})();

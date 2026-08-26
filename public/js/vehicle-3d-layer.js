import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const defaults = window.VEHICLE_3D_CONFIG;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ease = value => 1 - (1 - value) ** 3;
export const shortestAngleDifference = (from, to) => ((to - from + 540) % 360) - 180;

const COLOR_MAP = {
  branco: '#F8F9FA',
  branca: '#F8F9FA',
  white: '#F8F9FA',
  preto: '#1A1D21',
  preta: '#1A1D21',
  black: '#1A1D21',
  prata: '#C8D0D8',
  silver: '#C8D0D8',
  cinza: '#7A8490',
  grey: '#7A8490',
  gray: '#7A8490',
  azul: '#1668B8',
  blue: '#1668B8',
  vermelho: '#C41818',
  vermelha: '#C41818',
  red: '#C41818',
  amarelo: '#D89E00',
  amarela: '#D89E00',
  yellow: '#D89E00',
  verde: '#197A48',
  green: '#197A48',
  laranja: '#FF6A00',
  orange: '#FF6A00'
};

export function normalizeColorToHex(input, fallback = '#F5F5F5') {
  if (!input) return fallback;
  const clean = String(input).trim().toLowerCase();
  if (clean.startsWith('#') && /^[0-9a-f]{3,8}$/i.test(clean)) return clean;
  return COLOR_MAP[clean] || fallback;
}

export class Vehicle3DLayer {
  constructor({ map, maplibregl, config = defaults, onSelect, onReady, onError }) {
    this.id = 'rastreon-vehicle-3d';
    this.type = 'custom';
    this.renderingMode = '3d';
    this.map = map;
    this.maplibregl = maplibregl;
    this.config = config;
    this.onSelect = onSelect;
    this.onReady = onReady;
    this.onError = onError;
    this.position = null;
    this.heading = 0;
    this.selected = false;
    this.hovered = false;
    this.animation = null;
    this.bodyMeshes = [];
    this.headlightBeams = null;
    this.currentBodyColor = config?.bodyColor || '#F5F5F5';
  }

  async onAdd(map, gl) {
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);

    // Iluminação 3D sofisticada para realce de superfícies veiculares
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334455, 1.2);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    sunLight.position.set(-4, 8, -5);
    this.scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xbad2e8, 0.85);
    fillLight.position.set(5, 3, 4);
    this.scene.add(fillLight);

    // Sombra projetada no solo
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x080f18,
      transparent: true,
      opacity: this.config.shadowOpacity || 0.22,
      depthWrite: false
    });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.38, 32), shadowMaterial);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.root.add(this.shadow);

    // Halo/Anel de seleção interativo
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: this.config.accentColor || '#FF6A00',
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.halo = new THREE.Mesh(new THREE.RingGeometry(0.39, 0.52, 36), haloMaterial);
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.y = 0.018;
    this.root.add(this.halo);

    // Feixes suaves dos faróis dianteiros
    const beamGeometry = new THREE.ConeGeometry(0.28, 1.35, 16, 1, true);
    beamGeometry.rotateX(-Math.PI / 2);
    beamGeometry.translate(0, 0, 0.68);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff6cf,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.headlightBeams = new THREE.Group();
    const beamLeft = new THREE.Mesh(beamGeometry, beamMaterial);
    beamLeft.position.set(-0.17, 0.16, 0.44);
    beamLeft.scale.set(0.55, 0.45, 1);
    const beamRight = new THREE.Mesh(beamGeometry, beamMaterial);
    beamRight.position.set(0.17, 0.16, 0.44);
    beamRight.scale.set(0.55, 0.45, 1);
    this.headlightBeams.add(beamLeft, beamRight);
    this.root.add(this.headlightBeams);

    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true
    });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.boundClick = event => this.handleClick(event);
    this.boundMove = event => this.handlePointerMove(event);
    map.on('click', this.boundClick);
    map.on('mousemove', this.boundMove);

    try {
      const gltf = await new GLTFLoader().loadAsync(this.config.modelPath);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const longest = Math.max(size.x, size.z);
      model.position.set(-center.x, -box.min.y, -center.z);
      model.scale.setScalar(1 / longest);

      this.bodyMeshes = [];
      model.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = false;
        object.receiveShadow = false;
        const name = String(object.material?.name || object.name).toLowerCase();
        const isBody = /carroceria|cabine|teto/.test(name);
        const options = {
          color: this.currentBodyColor,
          metalness: 0.42,
          roughness: 0.24,
          wireframe: false,
          side: THREE.DoubleSide
        };

        if (/vidro/.test(name)) {
          Object.assign(options, {
            color: this.config.darkColor || '#111111',
            metalness: 0.12,
            roughness: 0.14,
            transparent: true,
            opacity: 0.88
          });
        } else if (/pneu/.test(name)) {
          Object.assign(options, {
            color: this.config.darkColor || '#111111',
            metalness: 0.04,
            roughness: 0.82
          });
        } else if (/roda|grade|para.?choque/.test(name)) {
          Object.assign(options, {
            color: this.config.wheelColor || '#333333',
            metalness: 0.72,
            roughness: 0.22
          });
        } else if (/rastreon|laranja|faixa|centro/.test(name)) {
          Object.assign(options, {
            color: this.config.accentColor || '#FF6A00',
            metalness: 0.35,
            roughness: 0.28
          });
        } else if (/lanterna/.test(name)) {
          Object.assign(options, {
            color: 0xb51a14,
            metalness: 0.2,
            roughness: 0.25,
            emissive: 0x550808,
            emissiveIntensity: 0.4
          });
        } else if (/farol/.test(name)) {
          Object.assign(options, {
            color: 0xfffae0,
            metalness: 0.18,
            roughness: 0.18,
            emissive: 0x665518,
            emissiveIntensity: 0.55
          });
        }

        object.material = new THREE.MeshStandardMaterial(options);
        if (isBody) this.bodyMeshes.push(object);
      });

      this.root.add(model);
      this.model = model;
      this.ready = true;
      this.onReady?.();
      map.triggerRepaint();
    } catch (error) {
      console.warn(
        '[Rastreon 3D] Não foi possível carregar o GLB; marcador padrão mantido.',
        error
      );
      this.failed = true;
      this.onError?.(error);
    }
  }

  setBodyColor(colorNameOrHex) {
    const hex = normalizeColorToHex(colorNameOrHex, this.config.bodyColor || '#F5F5F5');
    this.currentBodyColor = hex;
    for (const mesh of this.bodyMeshes) {
      if (mesh.material && mesh.material.color) {
        mesh.material.color.set(hex);
      }
    }
    this.map?.triggerRepaint();
  }

  move(from, to, duration = this.config.movementDuration) {
    if (!to) return;
    const start = this.position || from || to;
    const targetHeading = Number.isFinite(to.heading) ? to.heading : this.heading;
    if (!start) {
      this.position = to;
      this.heading = targetHeading;
      return;
    }
    const headingDelta = shortestAngleDifference(this.heading, targetHeading);
    const started = performance.now();
    this.animation = {
      started,
      duration: clamp(duration, 250, 1500),
      from: { latitude: start.latitude, longitude: start.longitude, heading: this.heading },
      to,
      headingDelta
    };
    this.position = { ...to };
    this.map?.triggerRepaint();
  }

  setSelected(selected) {
    this.selected = Boolean(selected);
    if (this.halo) this.halo.material.opacity = this.selected ? this.config.haloOpacity || 0.28 : 0;
    this.map?.triggerRepaint();
  }

  clear() {
    this.position = null;
    this.animation = null;
    this.selected = false;
    this.map?.triggerRepaint();
  }

  currentState(now) {
    if (!this.animation) return this.position ? { ...this.position, heading: this.heading } : null;
    const a = this.animation;
    const progress = clamp((now - a.started) / a.duration, 0, 1);
    const amount = ease(progress);
    const state = {
      latitude: a.from.latitude + (a.to.latitude - a.from.latitude) * amount,
      longitude: a.from.longitude + (a.to.longitude - a.from.longitude) * amount,
      heading: a.from.heading + a.headingDelta * amount
    };
    this.heading = ((state.heading % 360) + 360) % 360;
    if (progress === 1) {
      this.animation = null;
      this.position = { ...a.to };
      state.heading = this.heading;
    } else {
      this.map.triggerRepaint();
    }
    return state;
  }

  render(gl, args) {
    if (!this.ready || !this.position) return;
    const state = this.currentState(performance.now());
    const mercator = this.maplibregl.MercatorCoordinate.fromLngLat(
      [state.longitude, state.latitude],
      0
    );
    const zoom = this.map.getZoom();
    const zoomFactor = clamp(
      1 + (zoom - 16) * 0.045,
      this.config.minScale || 0.82,
      this.config.maxScale || 1.15
    );
    const metersPerPixel = (156543.03392 * Math.cos((state.latitude * Math.PI) / 180)) / 2 ** zoom;
    const worldScale =
      mercator.meterInMercatorCoordinateUnits() *
      metersPerPixel *
      (this.config.markerPixels || 24) *
      zoomFactor;

    this.root.rotation.y =
      THREE.MathUtils.degToRad(state.heading) + (this.config.rotationOffset || 0);
    const projection = args?.defaultProjectionData?.mainMatrix || args;
    const transform = new THREE.Matrix4()
      .makeTranslation(mercator.x, mercator.y, mercator.z)
      .scale(new THREE.Vector3(worldScale, -worldScale, worldScale))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(projection).multiply(transform);

    // Ajuste dinâmico de brilho dos faróis com base na velocidade
    if (this.headlightBeams) {
      const isMoving = (state.speed || 0) > 1;
      this.headlightBeams.visible = zoom >= 14.5;
      if (this.headlightBeams.children[0]?.material) {
        this.headlightBeams.children[0].material.opacity = isMoving ? 0.2 : 0.1;
      }
    }

    if (this.halo && this.halo.material) {
      this.halo.material.opacity = this.selected
        ? (this.config.haloOpacity || 0.28) * (this.hovered ? 1.25 : 1)
        : 0;
    }
    this.root.scale.setScalar(this.hovered ? 1.04 : 1);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }

  isPointerOver(point) {
    if (!this.position) return false;
    const screen = this.map.project([this.position.longitude, this.position.latitude]);
    return Math.hypot(point.x - screen.x, point.y - screen.y) <= 28;
  }

  handleClick(event) {
    if (!this.ready) return;
    if (!this.isPointerOver(event.point)) {
      this.setSelected(false);
      return;
    }
    this.setSelected(true);
    this.onSelect?.(event);
  }

  handlePointerMove(event) {
    const hovered = this.ready && this.isPointerOver(event.point);
    if (hovered === this.hovered) return;
    this.hovered = hovered;
    this.map.getCanvas().style.cursor = hovered ? 'pointer' : '';
    this.map.triggerRepaint();
  }

  onRemove(map) {
    map.off('click', this.boundClick);
    map.off('mousemove', this.boundMove);
    this.renderer?.dispose();
    this.scene?.traverse(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(value => value.dispose?.());
      else object.material?.dispose?.();
    });
  }
}

export function installVehicle3DLayer(options) {
  const layer = new Vehicle3DLayer(options);
  if (options.map.getLayer(layer.id)) options.map.removeLayer(layer.id);
  options.map.addLayer(layer);
  return layer;
}

export async function installVehicle3DPreview({
  canvas,
  config = defaults,
  color,
  autoRotate = true,
  onReady,
  onError
}) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Canvas 3D inválido.');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, 1, 0.01, 20);
  camera.position.set(2.15, 1.22, 2.65);
  camera.lookAt(0, 0.38, 0);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x526170, 2.1));
  const key = new THREE.DirectionalLight(0xfff8ea, 3.2);
  key.position.set(-3, 5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb9d9f4, 1.45);
  fill.position.set(4, 2, -3);
  scene.add(fill);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.82, 48),
    new THREE.MeshBasicMaterial({
      color: 0x172536,
      transparent: true,
      opacity: 0.13,
      depthWrite: false
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.015;
  scene.add(floor);
  let frame = 0,
    disposed = false,
    visible = true,
    dragging = false,
    lastX = 0,
    angle = -0.62,
    bodyMeshes = [],
    modelBounds = null;
  const fitModelToCanvas = () => {
    if (!modelBounds) return;
    const verticalFov = THREE.MathUtils.degToRad(camera.fov),
      horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect),
      limitingFov = Math.min(verticalFov, horizontalFov),
      distance = (modelBounds.radius / Math.sin(limitingFov / 2)) * 1.04,
      target = modelBounds.center,
      direction = new THREE.Vector3(2.15, 0.84, 2.65).normalize();
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.near = Math.max(0.01, distance - modelBounds.radius * 2);
    camera.far = distance + modelBounds.radius * 3;
    camera.lookAt(target);
  };
  const resize = () => {
    const width = Math.max(1, canvas.clientWidth || canvas.width || 300),
      height = Math.max(1, canvas.clientHeight || canvas.height || 160),
      ratio = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    fitModelToCanvas();
    camera.updateProjectionMatrix();
  };
  const setBodyColor = value => {
    const hex = normalizeColorToHex(value, config.bodyColor || '#F5F5F5');
    for (const mesh of bodyMeshes) mesh.material?.color?.set(hex);
  };
  const render = () => {
    if (disposed) return;
    if (visible) {
      if (autoRotate && !dragging) angle += 0.0025;
      if (model) model.rotation.y = angle;
      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(render);
  };
  let model;
  try {
    const loader = new GLTFLoader();
    const ktx2 = new KTX2Loader().setTranscoderPath(
      'https://cdn.jsdelivr.net/npm/three@0.179.1/examples/jsm/libs/basis/'
    );
    ktx2.detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
    const gltf = await loader.loadAsync(config.modelPath);
    model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model),
      size = box.getSize(new THREE.Vector3()),
      center = box.getCenter(new THREE.Vector3()),
      longest = Math.max(size.x, size.z);
    model.position.set(-center.x, -box.min.y, -center.z);
    model.scale.setScalar(1 / longest);
    const fittedBox = new THREE.Box3().setFromObject(model);
    modelBounds = fittedBox.getBoundingSphere(new THREE.Sphere());
    fitModelToCanvas();
    model.traverse(object => {
      if (!object.isMesh) return;
      const name = String(object.material?.name || object.name).toLowerCase(),
        isBody = /carroceria|cabine|teto/.test(name);
      const options = {
        color: normalizeColorToHex(color, config.bodyColor || '#F5F5F5'),
        metalness: 0.42,
        roughness: 0.24,
        side: THREE.DoubleSide
      };
      if (/vidro/.test(name))
        Object.assign(options, {
          color: config.darkColor || '#111111',
          metalness: 0.12,
          roughness: 0.14,
          transparent: true,
          opacity: 0.88
        });
      else if (/pneu/.test(name))
        Object.assign(options, {
          color: config.darkColor || '#111111',
          metalness: 0.04,
          roughness: 0.82
        });
      else if (/roda|grade|para.?choque/.test(name))
        Object.assign(options, {
          color: config.wheelColor || '#333333',
          metalness: 0.72,
          roughness: 0.22
        });
      else if (/rastreon|laranja|faixa|centro/.test(name))
        Object.assign(options, {
          color: config.accentColor || '#FF6A00',
          metalness: 0.35,
          roughness: 0.28
        });
      else if (/lanterna/.test(name))
        Object.assign(options, { color: 0xb51a14, emissive: 0x550808, emissiveIntensity: 0.4 });
      else if (/farol/.test(name))
        Object.assign(options, { color: 0xfffae0, emissive: 0x665518, emissiveIntensity: 0.55 });
      object.material = new THREE.MeshStandardMaterial(options);
      if (isBody) bodyMeshes.push(object);
    });
    scene.add(model);
    resize();
    const observer = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting !== false;
    });
    observer.observe(canvas);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    canvas.addEventListener('pointerdown', event => {
      dragging = true;
      lastX = event.clientX;
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!dragging) return;
      angle += (event.clientX - lastX) * 0.012;
      lastX = event.clientX;
    });
    const release = () => {
      dragging = false;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    render();
    onReady?.();
    return {
      ready: true,
      setBodyColor,
      destroy() {
        disposed = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        resizeObserver.disconnect();
        renderer.dispose();
        scene.traverse(object => {
          object.geometry?.dispose?.();
          if (Array.isArray(object.material)) object.material.forEach(item => item.dispose?.());
          else object.material?.dispose?.();
        });
      }
    };
  } catch (error) {
    renderer.dispose();
    onError?.(error);
    throw error;
  }
}

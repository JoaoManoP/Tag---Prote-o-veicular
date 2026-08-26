'use strict';
const byId = id => document.getElementById(id);
const video = byId('faceVideo'),
  canvas = byId('faceCanvas'),
  facePreview = byId('facePreview');
let cameraStream = null;
function stopCamera() {
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  if (video) video.srcObject = null;
}
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    byId('cameraStatus').textContent = 'A câmera exige HTTPS ou localhost neste navegador.';
    return;
  }
  try {
    stopCamera();
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = cameraStream;
    await video.play();
    byId('cameraPlaceholder').classList.add('hidden');
    facePreview.classList.add('hidden');
    video.classList.remove('hidden');
    byId('startCamera').classList.add('hidden');
    byId('retakeFace').classList.add('hidden');
    byId('captureFace').classList.remove('hidden');
    byId('cameraStatus').textContent = 'Câmera ativa. Centralize o rosto e faça a captura.';
  } catch (_) {
    byId('cameraStatus').textContent =
      'Não foi possível acessar a câmera. Verifique a permissão do navegador.';
  }
}
byId('startCamera')?.addEventListener('click', startCamera);
byId('retakeFace')?.addEventListener('click', startCamera);
byId('captureFace')?.addEventListener('click', () => {
  const size = Math.min(video.videoWidth, video.videoHeight);
  if (!size) return;
  canvas.width = 480;
  canvas.height = 480;
  canvas
    .getContext('2d')
    .drawImage(
      video,
      (video.videoWidth - size) / 2,
      (video.videoHeight - size) / 2,
      size,
      size,
      0,
      0,
      480,
      480
    );
  facePreview.src = canvas.toDataURL('image/jpeg', 0.82);
  stopCamera();
  video.classList.add('hidden');
  byId('captureFace').classList.add('hidden');
  facePreview.classList.remove('hidden');
  byId('retakeFace').classList.remove('hidden');
  byId('faceCaptured').value = 'true';
  byId('cameraStatus').textContent =
    'Captura concluída localmente. A imagem não será enviada neste ambiente.';
});
window.addEventListener('pagehide', stopCamera);

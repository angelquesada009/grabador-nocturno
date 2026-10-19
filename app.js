const botonActivar = document.getElementById("btn-activar");
const mensaje = document.getElementById("mensaje");
const barraNivel = document.getElementById("barra-nivel");
const barraUmbral = document.getElementById("barra-umbral");

// Ajustes de sensibilidad (se afinan probando en el iPhone).
const GANANCIA = 400;             // cuánto se amplifica el volumen
const BAJADA = 0.9;               // 0-1: cuanto más alto, más despacio baja la barra
const SEGUNDOS_CALIBRACION = 3;   // tiempo que escucha el ruido de fondo al empezar
const MARGEN = 2.5;               // un sonido cuenta si es 2,5 veces el ruido de fondo
const UMBRAL_MINIMO = 2;          // umbral mínimo (0-100), por si la habitación es muy silenciosa

let stream = null;
let contexto = null;
let analizador = null;
let datos = null;
let nivelSuavizado = 0;
let idAnimacion = null;

// Calibración del ruido de fondo.
let inicioCalibracion = 0;
let sumaCalibracion = 0;
let muestrasCalibracion = 0;
let ruidoFondo = null;   // null mientras se está calibrando
let umbral = UMBRAL_MINIMO;

// El mismo botón sirve para activar y para parar.
function alternarMicrofono() {
  if (stream) {
    pararMicrofono();
    mensaje.textContent = "Micrófono parado.";
  } else {
    activarMicrofono();
  }
}

async function activarMicrofono() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    mensaje.textContent = "Este navegador no permite usar el micrófono (¿falta HTTPS?).";
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await empezarAMedir();
    mensaje.textContent = "Calibrando… quédate en silencio " + SEGUNDOS_CALIBRACION + " segundos.";
    botonActivar.textContent = "Parar micrófono";
  } catch (error) {
    pararMicrofono(); // por si el micro se llegó a abrir antes del fallo
    if (error.name === "NotAllowedError") {
      mensaje.textContent = "Has denegado el permiso. Actívalo en los ajustes del navegador.";
    } else if (error.name === "NotFoundError") {
      mensaje.textContent = "No se ha encontrado ningún micrófono.";
    } else {
      mensaje.textContent = "No se pudo activar el micrófono: " + error.name;
    }
  }
}

// Conecta el micrófono a un "analizador" que nos da el volumen.
async function empezarAMedir() {
  const AudioContextCompatible = window.AudioContext || window.webkitAudioContext;
  contexto = new AudioContextCompatible();
  await contexto.resume(); // Safari a veces lo deja en pausa

  const fuente = contexto.createMediaStreamSource(stream);
  analizador = contexto.createAnalyser();
  analizador.fftSize = 256;
  fuente.connect(analizador);

  datos = new Uint8Array(analizador.fftSize);

  // Empezamos la calibración desde cero.
  inicioCalibracion = performance.now();
  sumaCalibracion = 0;
  muestrasCalibracion = 0;
  ruidoFondo = null;
  ponerUmbral(UMBRAL_MINIMO);

  actualizarBarra();
}

// Devuelve el volumen actual como un número de 0 a 100.
function medirNivel() {
  analizador.getByteTimeDomainData(datos);

  // Los valores van de 0 a 255; el silencio está en 128.
  let suma = 0;
  for (let i = 0; i < datos.length; i++) {
    const valor = (datos[i] - 128) / 128; // de -1 a 1
    suma += valor * valor;
  }
  const rms = Math.sqrt(suma / datos.length); // volumen medio, de 0 a 1

  return Math.min(100, rms * GANANCIA);
}

// Coloca la marca del umbral en la barra.
function ponerUmbral(valor) {
  umbral = valor;
  barraUmbral.style.left = Math.min(100, umbral) + "%";
}

// Durante los primeros segundos solo escuchamos para saber cuánto ruido hay de fondo.
function calibrar(nivel) {
  sumaCalibracion += nivel;
  muestrasCalibracion++;

  const segundos = (performance.now() - inicioCalibracion) / 1000;
  if (segundos < SEGUNDOS_CALIBRACION) return;

  ruidoFondo = sumaCalibracion / muestrasCalibracion;
  // La barra muestra el nivel menos el ruido de fondo, así que el umbral
  // también se calcula sobre esa diferencia.
  ponerUmbral(Math.max(UMBRAL_MINIMO, ruidoFondo * (MARGEN - 1)));
  mensaje.textContent = "Escuchando…";
}

// Se repite unas 60 veces por segundo para mover la barra.
function actualizarBarra() {
  const nivel = medirNivel();

  if (ruidoFondo === null) {
    calibrar(nivel);
    barraNivel.style.width = "0%";
    idAnimacion = requestAnimationFrame(actualizarBarra);
    return;
  }

  // Quitamos el ruido de fondo: en silencio la barra se queda en 0.
  const sobreFondo = Math.max(0, nivel - ruidoFondo);
  // Sube rápido con los sonidos, pero baja despacio para que no tiemble.
  nivelSuavizado = Math.max(sobreFondo, nivelSuavizado * BAJADA);
  barraNivel.style.width = nivelSuavizado + "%";
  // Rojo cuando el sonido supera el umbral.
  barraNivel.classList.toggle("sonido", sobreFondo > umbral);

  idAnimacion = requestAnimationFrame(actualizarBarra);
}

// Apaga el micrófono del todo y deja la barra a cero.
function pararMicrofono() {
  if (idAnimacion) {
    cancelAnimationFrame(idAnimacion);
    idAnimacion = null;
  }
  if (stream) {
    stream.getTracks().forEach((pista) => pista.stop());
    stream = null;
  }
  if (contexto) {
    contexto.close();
    contexto = null;
  }
  analizador = null;
  nivelSuavizado = 0;
  ruidoFondo = null;
  barraNivel.style.width = "0%";
  barraNivel.classList.remove("sonido");
  botonActivar.textContent = "Activar micrófono";
}

botonActivar.addEventListener("click", alternarMicrofono);

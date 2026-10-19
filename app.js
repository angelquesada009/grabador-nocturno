// ===== Elementos de la página =====
const botonActivar = document.getElementById("btn-activar");
const botonNoche = document.getElementById("btn-noche");
const mensaje = document.getElementById("mensaje");
const statSonidos = document.getElementById("stat-sonidos");
const statUmbral = document.getElementById("stat-umbral");
const statTiempo = document.getElementById("stat-tiempo");
const reloj = document.getElementById("reloj");
const fecha = document.getElementById("fecha");
const estado = document.getElementById("estado");
const estadoTexto = document.getElementById("estado-texto");
const barraNivel = document.getElementById("barra-nivel");
const barraUmbral = document.getElementById("barra-umbral");
const pantallaNegra = document.getElementById("pantalla-negra");

// ===== Ajustes de sensibilidad (se afinan probando en el iPhone) =====
const GANANCIA = 400;             // cuánto se amplifica el volumen
const BAJADA = 0.9;               // 0-1: cuanto más alto, más despacio baja la barra
const SEGUNDOS_CALIBRACION = 3;   // tiempo que escucha el ruido de fondo al empezar
const MARGEN = 2.5;               // un sonido cuenta si es 2,5 veces el ruido de fondo
const UMBRAL_MINIMO = 2;          // umbral mínimo (0-100), por si la habitación es muy silenciosa

// ===== Ajustes de grabación =====
const FRECUENCIA = 16000;         // calidad del audio guardado (suficiente para voz)
const SEGUNDOS_PREVIOS = 1.5;     // segundos antes del sonido que se guardan también
const SEGUNDOS_SILENCIO = 1.5;    // silencio necesario para dar por terminado un sonido
const SEGUNDOS_MAXIMOS = 60;      // un sonido muy largo se corta en trozos de este tamaño

// ===== Estado =====
let stream = null;
let contexto = null;
let procesador = null;
let idAnimacion = null;
let bloqueoPantalla = null;

let nivelSuavizado = 0;
let sobreFondoActual = 0;
let sonidosSesion = 0;
let inicioEscucha = 0;

// Calibración del ruido de fondo.
let inicioCalibracion = 0;
let sumaCalibracion = 0;
let muestrasCalibracion = 0;
let ruidoFondo = null;   // null mientras se está calibrando
let umbral = UMBRAL_MINIMO;

// Grabación.
let previo = [];          // los últimos segundos, siempre guardados "por si acaso"
let muestrasPrevio = 0;
let grabando = false;
let trozos = [];
let muestrasGrabadas = 0;
let ultimoRuido = 0;
let horaInicio = 0;

// ===== Activar y parar =====
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
    await empezarAEscuchar();
    mensaje.textContent = "Calibrando… quédate en silencio " + SEGUNDOS_CALIBRACION + " segundos.";
    botonActivar.textContent = "Parar micrófono";
    ponerEstado("calibrando");
    inicioEscucha = Date.now();
    sonidosSesion = 0;
    statSonidos.textContent = "0";
    pedirPantallaEncendida();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
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

// Conecta el micrófono a un procesador que recibe el sonido en bloques pequeños.
async function empezarAEscuchar() {
  const AudioContextCompatible = window.AudioContext || window.webkitAudioContext;
  contexto = new AudioContextCompatible();
  await contexto.resume(); // Safari a veces lo deja en pausa

  const fuente = contexto.createMediaStreamSource(stream);
  procesador = contexto.createScriptProcessor(4096, 1, 1);
  procesador.onaudioprocess = procesarBloque;
  fuente.connect(procesador);
  procesador.connect(contexto.destination); // sin esto Safari no avisa; no suena nada

  inicioCalibracion = performance.now();
  sumaCalibracion = 0;
  muestrasCalibracion = 0;
  ruidoFondo = null;
  previo = [];
  muestrasPrevio = 0;
  ponerUmbral(UMBRAL_MINIMO);

  actualizarBarra();
}

function pararMicrofono() {
  terminarGrabacion(); // si estaba grabando un sonido, lo guarda antes de parar

  if (idAnimacion) {
    cancelAnimationFrame(idAnimacion);
    idAnimacion = null;
  }
  if (procesador) {
    procesador.onaudioprocess = null;
    procesador.disconnect();
    procesador = null;
  }
  if (stream) {
    stream.getTracks().forEach((pista) => pista.stop());
    stream = null;
  }
  if (contexto) {
    contexto.close();
    contexto = null;
  }
  soltarPantalla();

  nivelSuavizado = 0;
  sobreFondoActual = 0;
  ruidoFondo = null;
  previo = [];
  muestrasPrevio = 0;
  barraNivel.style.width = "0%";
  barraNivel.classList.remove("sonido");
  botonActivar.textContent = "Activar micrófono";
  inicioEscucha = 0;
  ponerEstado("reposo");
}

// ===== Procesado del sonido (se ejecuta cada ~0,1 segundos) =====
function procesarBloque(evento) {
  const entrada = evento.inputBuffer.getChannelData(0);

  // Volumen medio (RMS) del bloque, de 0 a 100.
  let suma = 0;
  for (let i = 0; i < entrada.length; i++) suma += entrada[i] * entrada[i];
  const nivel = Math.min(100, Math.sqrt(suma / entrada.length) * GANANCIA);
  const ahora = performance.now();

  if (ruidoFondo === null) {
    calibrar(nivel, ahora);
    return;
  }

  sobreFondoActual = Math.max(0, nivel - ruidoFondo);
  const hayRuido = sobreFondoActual > umbral;
  const bloque = reducir(entrada, contexto.sampleRate);

  if (!grabando) {
    // Guardamos solo los últimos segundos; lo más antiguo se tira.
    previo.push(bloque);
    muestrasPrevio += bloque.length;
    const maximo = SEGUNDOS_PREVIOS * FRECUENCIA;
    while (previo.length > 1 && muestrasPrevio - previo[0].length >= maximo) {
      muestrasPrevio -= previo.shift().length;
    }
    if (hayRuido) empezarGrabacion(ahora);
  } else {
    trozos.push(bloque);
    muestrasGrabadas += bloque.length;
    if (hayRuido) ultimoRuido = ahora;
    const silencio = ahora - ultimoRuido > SEGUNDOS_SILENCIO * 1000;
    if (silencio || muestrasGrabadas >= SEGUNDOS_MAXIMOS * FRECUENCIA) terminarGrabacion();
  }
}

// Durante los primeros segundos solo escuchamos para saber cuánto ruido hay de fondo.
function calibrar(nivel, ahora) {
  sumaCalibracion += nivel;
  muestrasCalibracion++;
  if ((ahora - inicioCalibracion) / 1000 < SEGUNDOS_CALIBRACION) return;

  ruidoFondo = sumaCalibracion / muestrasCalibracion;
  // La barra muestra el nivel menos el ruido de fondo, así que el umbral
  // también se calcula sobre esa diferencia.
  ponerUmbral(Math.max(UMBRAL_MINIMO, ruidoFondo * (MARGEN - 1)));
  mensaje.textContent = "Escuchando…";
  ponerEstado("escuchando");
}

// Pasa de la frecuencia del móvil (44100 o 48000) a 16000, haciendo la media de cada tramo.
function reducir(entrada, frecuenciaOriginal) {
  const razon = frecuenciaOriginal / FRECUENCIA;
  const salida = new Int16Array(Math.floor(entrada.length / razon));
  for (let j = 0; j < salida.length; j++) {
    const desde = Math.floor(j * razon);
    const hasta = Math.max(desde + 1, Math.floor((j + 1) * razon));
    let suma = 0;
    for (let i = desde; i < hasta; i++) suma += entrada[i];
    const valor = Math.max(-1, Math.min(1, suma / (hasta - desde)));
    salida[j] = valor * 32767;
  }
  return salida;
}

// ===== Grabación de un sonido =====
function empezarGrabacion(ahora) {
  grabando = true;
  trozos = previo; // incluimos los segundos de antes del sonido
  muestrasGrabadas = muestrasPrevio;
  previo = [];
  muestrasPrevio = 0;
  ultimoRuido = ahora;
  horaInicio = Date.now() - (muestrasGrabadas / FRECUENCIA) * 1000;
  mensaje.textContent = "Grabando sonido…";
  ponerEstado("grabando");
}

async function terminarGrabacion() {
  if (!grabando) return;
  const partes = trozos;
  const muestras = muestrasGrabadas;
  const inicio = horaInicio;
  grabando = false;
  trozos = [];
  muestrasGrabadas = 0;

  try {
    await BD.guardarSonido(
      { noche: claveNoche(inicio), hora: inicio, duracion: muestras / FRECUENCIA },
      crearWav(partes, muestras)
    );
    sonidosSesion++;
    statSonidos.textContent = sonidosSesion;
    if (stream && ruidoFondo !== null) {
      mensaje.textContent = "Escuchando…";
      ponerEstado("escuchando");
    }
  } catch (error) {
    mensaje.textContent = "No se pudo guardar el sonido (¿sin espacio?).";
  }
}

// Las noches van de las 12:00 a las 12:00, así lo que suene tras medianoche
// pertenece a la noche que empezó el día anterior.
function claveNoche(marcaTiempo) {
  const d = new Date(marcaTiempo - 12 * 3600 * 1000);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + mes + "-" + dia;
}

// Construye un archivo WAV (audio sin comprimir) a partir de los trozos.
function crearWav(partes, totalMuestras) {
  const buffer = new ArrayBuffer(44 + totalMuestras * 2);
  const vista = new DataView(buffer);
  const texto = (posicion, cadena) => {
    for (let i = 0; i < cadena.length; i++) vista.setUint8(posicion + i, cadena.charCodeAt(i));
  };
  texto(0, "RIFF");
  vista.setUint32(4, 36 + totalMuestras * 2, true);
  texto(8, "WAVE");
  texto(12, "fmt ");
  vista.setUint32(16, 16, true);
  vista.setUint16(20, 1, true);              // sin comprimir
  vista.setUint16(22, 1, true);              // mono
  vista.setUint32(24, FRECUENCIA, true);
  vista.setUint32(28, FRECUENCIA * 2, true);
  vista.setUint16(32, 2, true);
  vista.setUint16(34, 16, true);
  texto(36, "data");
  vista.setUint32(40, totalMuestras * 2, true);

  let posicion = 44;
  partes.forEach((parte) => {
    for (let i = 0; i < parte.length; i++, posicion += 2) vista.setInt16(posicion, parte[i], true);
  });
  return buffer;
}

// ===== Barra de nivel =====
function ponerUmbral(valor) {
  umbral = valor;
  barraUmbral.style.left = Math.min(100, umbral) + "%";
  statUmbral.textContent = umbral.toFixed(1);
}

// ===== Estado, reloj y tiempo de escucha =====
const TEXTOS_ESTADO = {
  reposo: "En reposo",
  calibrando: "Calibrando",
  escuchando: "Escuchando",
  grabando: "Grabando",
};

function ponerEstado(nombre) {
  estado.dataset.estado = nombre;
  estadoTexto.textContent = TEXTOS_ESTADO[nombre];
}

function dosCifras(n) {
  return String(n).padStart(2, "0");
}

function actualizarReloj() {
  const ahora = new Date();
  reloj.textContent = dosCifras(ahora.getHours()) + ":" + dosCifras(ahora.getMinutes());
  fecha.textContent = ahora.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  if (inicioEscucha) {
    const s = Math.floor((Date.now() - inicioEscucha) / 1000);
    statTiempo.textContent = Math.floor(s / 3600) + ":" + dosCifras(Math.floor(s / 60) % 60) + ":" + dosCifras(s % 60);
  } else {
    statTiempo.textContent = "0:00:00";
  }
}

actualizarReloj();
setInterval(actualizarReloj, 1000);
ponerEstado("reposo");

// Se repite unas 60 veces por segundo para mover la barra.
function actualizarBarra() {
  // Sube rápido con los sonidos, pero baja despacio para que no tiemble.
  nivelSuavizado = Math.max(sobreFondoActual, nivelSuavizado * BAJADA);
  barraNivel.style.width = nivelSuavizado + "%";
  barraNivel.classList.toggle("sonido", grabando); // rojo mientras graba
  idAnimacion = requestAnimationFrame(actualizarBarra);
}

// ===== Pantalla encendida y pantalla negra =====
async function pedirPantallaEncendida() {
  try {
    if ("wakeLock" in navigator) bloqueoPantalla = await navigator.wakeLock.request("screen");
  } catch (error) {
    // Si no se puede, la app sigue funcionando; solo habrá que desactivar el bloqueo de pantalla.
  }
}

function soltarPantalla() {
  if (bloqueoPantalla) {
    bloqueoPantalla.release().catch(() => {});
    bloqueoPantalla = null;
  }
}

// Al volver a la app, el sistema suelta el bloqueo; lo pedimos otra vez.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && stream) pedirPantallaEncendida();
});

botonNoche.addEventListener("click", () => { pantallaNegra.hidden = false; });
pantallaNegra.addEventListener("click", () => { pantallaNegra.hidden = true; });

botonActivar.addEventListener("click", alternarMicrofono);

// ===== Instalar como app (funciona sin conexión) =====
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

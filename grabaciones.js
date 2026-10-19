// Pantalla "Grabaciones": calendario del mes y, dentro de cada noche, sus sonidos.
const vistaEscuchar = document.getElementById("vista-escuchar");
const vistaGrabaciones = document.getElementById("vista-grabaciones");
const pestanaEscuchar = document.getElementById("tab-escuchar");
const pestanaGrabaciones = document.getElementById("tab-grabaciones");
const lista = document.getElementById("lista");

let noches = {};                 // clave de noche -> { cantidad, duracion }
let mesVisible = new Date();     // el día siempre es 1

function mostrarVista(nombre) {
  const escuchar = nombre === "escuchar";
  vistaEscuchar.hidden = !escuchar;
  vistaGrabaciones.hidden = escuchar;
  pestanaEscuchar.classList.toggle("activa", escuchar);
  pestanaGrabaciones.classList.toggle("activa", !escuchar);
  if (!escuchar) mostrarNoches();
}

pestanaEscuchar.addEventListener("click", () => mostrarVista("escuchar"));
pestanaGrabaciones.addEventListener("click", () => mostrarVista("grabaciones"));

// ===== Utilidades =====
function crear(etiqueta, texto, clase) {
  const e = document.createElement(etiqueta);
  if (texto) e.textContent = texto;
  if (clase) e.className = clase;
  return e;
}

function fechaDeClave(clave) {
  const [a, m, d] = clave.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function claveDeFecha(fecha) {
  return fecha.getFullYear() + "-" + String(fecha.getMonth() + 1).padStart(2, "0") + "-" + String(fecha.getDate()).padStart(2, "0");
}

function textoDuracion(segundos) {
  const total = Math.round(segundos);
  if (total < 60) return total + " s";
  return Math.floor(total / 60) + " min " + (total % 60) + " s";
}

function textoDia(clave) {
  return fechaDeClave(clave).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

function textoHora(marcaTiempo) {
  return new Date(marcaTiempo).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function plural(n, uno, varios) {
  return n + " " + (n === 1 ? uno : varios);
}

// ===== Calendario =====
// mirarClave: noche a la que llevar el calendario (si no, la más reciente).
async function mostrarNoches(mirarClave) {
  let sonidos;
  try {
    sonidos = await BD.listarSonidos();
  } catch (error) {
    lista.replaceChildren(crear("p", "No se pudieron leer las grabaciones.", "aviso"));
    return;
  }

  noches = {};
  sonidos.forEach((s) => {
    noches[s.noche] = noches[s.noche] || { cantidad: 0, duracion: 0 };
    noches[s.noche].cantidad++;
    noches[s.noche].duracion += s.duracion;
  });

  const claves = Object.keys(noches).sort();
  const destino = mirarClave || claves[claves.length - 1];
  const base = destino ? fechaDeClave(destino) : new Date();
  mesVisible = new Date(base.getFullYear(), base.getMonth(), 1);

  dibujarCalendario();
}

function cambiarMes(delta) {
  mesVisible = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + delta, 1);
  dibujarCalendario();
}

function dibujarCalendario() {
  lista.replaceChildren();

  // Cabecera con el mes y las flechas.
  const titulo = mesVisible.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const anterior = crear("button", "‹", "flecha");
  anterior.setAttribute("aria-label", "Mes anterior");
  anterior.addEventListener("click", () => cambiarMes(-1));
  const siguiente = crear("button", "›", "flecha");
  siguiente.setAttribute("aria-label", "Mes siguiente");
  siguiente.addEventListener("click", () => cambiarMes(1));
  const cabecera = crear("div", "", "mes-cabecera");
  cabecera.append(anterior, crear("h2", titulo), siguiente);

  // Cuadrícula de días.
  const rejilla = crear("div", "", "calendario");
  ["L", "M", "X", "J", "V", "S", "D"].forEach((d) => rejilla.append(crear("span", d, "dia-semana")));

  const primero = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1);
  const diasMes = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 0).getDate();
  for (let i = 0; i < (primero.getDay() + 6) % 7; i++) rejilla.append(crear("span"));

  const clavesMes = [];
  const claveHoy = claveDeFecha(new Date());
  for (let d = 1; d <= diasMes; d++) {
    const clave = claveDeFecha(new Date(mesVisible.getFullYear(), mesVisible.getMonth(), d));
    const hay = noches[clave];
    const celda = crear(hay ? "button" : "span", String(d), "dia");
    if (hay) {
      clavesMes.push(clave);
      celda.classList.add("con-sonidos");
      celda.setAttribute("aria-label", textoDia(clave) + ", " + plural(hay.cantidad, "sonido", "sonidos"));
      celda.addEventListener("click", () => mostrarSonidos(clave));
    }
    if (clave === claveHoy) celda.classList.add("hoy");
    rejilla.append(celda);
  }

  lista.append(cabecera, rejilla);

  // Lista de las noches de este mes, de la más reciente a la más antigua.
  if (Object.keys(noches).length === 0) {
    lista.append(crear("p", "Todavía no hay grabaciones. Activa el micrófono en la pestaña Escuchar.", "aviso"));
    return;
  }
  if (clavesMes.length === 0) {
    lista.append(crear("p", "No hay grabaciones en este mes.", "aviso"));
    return;
  }

  const resumen = crear("div", "", "noches-mes");
  clavesMes.reverse().forEach((clave) => {
    const datos = noches[clave];
    const fila = crear("button", "", "noche-item");
    fila.append(
      crear("span", textoDia(clave), "noche-dia"),
      crear("span", plural(datos.cantidad, "sonido", "sonidos") + ", " + textoDuracion(datos.duracion), "noche-datos")
    );
    fila.addEventListener("click", () => mostrarSonidos(clave));
    resumen.append(fila);
  });
  lista.append(resumen);
}

// ===== Una noche =====
async function mostrarSonidos(noche) {
  lista.replaceChildren();

  const volver = crear("button", "‹ Calendario", "volver");
  volver.addEventListener("click", () => mostrarNoches(noche));

  let sonidos;
  try {
    sonidos = (await BD.sonidosDeNoche(noche)).sort((a, b) => a.hora - b.hora);
  } catch (error) {
    lista.append(volver, crear("p", "No se pudieron leer los sonidos de esta noche.", "aviso"));
    return;
  }

  const total = sonidos.reduce((suma, s) => suma + s.duracion, 0);
  lista.append(
    volver,
    crear("h2", textoDia(noche), "titulo-noche"),
    crear("p", plural(sonidos.length, "sonido", "sonidos") + ", " + textoDuracion(total), "subtitulo")
  );

  const filas = {};
  lista.append(crearLineaTiempo(noche, sonidos, filas));

  sonidos.forEach((sonido) => {
    const fila = crearFila(sonido, noche);
    filas[sonido.id] = fila;
    lista.append(fila);
  });

  lista.append(crearBorrarNoche(noche, sonidos));
}

// Línea de las 12:00 a las 12:00 con una marca por cada sonido.
function crearLineaTiempo(noche, sonidos, filas) {
  const inicio = fechaDeClave(noche);
  inicio.setHours(12, 0, 0, 0);
  const duracionNoche = 24 * 3600 * 1000;

  const contenedor = crear("div", "", "linea-tiempo");
  const pista = crear("div", "", "pista");
  sonidos.forEach((sonido) => {
    const posicion = Math.max(0, Math.min(100, ((sonido.hora - inicio.getTime()) / duracionNoche) * 100));
    const marca = crear("button", "", "marca-sonido");
    marca.style.left = posicion + "%";
    marca.setAttribute("aria-label", "Sonido a las " + textoHora(sonido.hora));
    marca.addEventListener("click", () => {
      const fila = filas[sonido.id];
      fila.scrollIntoView({ behavior: "smooth", block: "center" });
      fila.classList.add("resaltada");
      setTimeout(() => fila.classList.remove("resaltada"), 1600);
    });
    pista.append(marca);
  });

  const horas = crear("div", "", "horas");
  ["12:00", "18:00", "00:00", "06:00", "12:00"].forEach((h) => horas.append(crear("span", h)));
  contenedor.append(pista, horas);
  return contenedor;
}

// ===== Reproductor con onda =====
let reproductorActivo = null;   // solo suena un sonido a la vez

function formatoTiempo(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

// Lee el audio guardado (WAV de 16 bits tras 44 bytes de cabecera) y saca el volumen de cada tramo.
function calcularPicos(buffer, cantidad) {
  const muestras = new Int16Array(buffer, 44, Math.floor((buffer.byteLength - 44) / 2));
  const tramo = Math.max(1, Math.floor(muestras.length / cantidad));
  const picos = [];
  for (let i = 0; i < cantidad; i++) {
    let maximo = 0;
    for (let j = i * tramo; j < Math.min(muestras.length, (i + 1) * tramo); j++) {
      maximo = Math.max(maximo, Math.abs(muestras[j]));
    }
    picos.push(maximo);
  }
  // Se escala al más alto para que también se vean los sonidos flojos.
  const mayor = Math.max(...picos, 1);
  return picos.map((p) => p / mayor);
}

function crearReproductor(sonido) {
  const elemento = crear("div", "", "reproductor");
  elemento.hidden = true;

  const audio = document.createElement("audio");
  const boton = crear("button", "Reproducir", "accion");
  const tiempo = crear("span", "0:00 / " + formatoTiempo(sonido.duracion), "tiempo");
  const lienzo = document.createElement("canvas");
  lienzo.className = "onda";
  const controles = crear("div", "", "reproductor-controles");
  controles.append(boton, tiempo);
  elemento.append(lienzo, controles);

  const estilos = getComputedStyle(document.documentElement);
  const colorHecho = estilos.getPropertyValue("--ambar").trim();
  const colorPendiente = estilos.getPropertyValue("--linea").trim();
  let picos = null;
  let animacion = null;

  const duracion = () => (isFinite(audio.duration) && audio.duration > 0 ? audio.duration : sonido.duracion);

  function dibujar() {
    if (!picos) return;
    const escala = window.devicePixelRatio || 1;
    const ancho = lienzo.clientWidth;
    const alto = lienzo.clientHeight;
    if (lienzo.width !== Math.round(ancho * escala)) {
      lienzo.width = Math.round(ancho * escala);
      lienzo.height = Math.round(alto * escala);
    }
    const c = lienzo.getContext("2d");
    c.setTransform(escala, 0, 0, escala, 0, 0);
    c.clearRect(0, 0, ancho, alto);

    const avance = audio.currentTime / duracion();
    const paso = ancho / picos.length;
    picos.forEach((p, i) => {
      const altura = Math.max(2, p * (alto - 4));
      c.fillStyle = i / picos.length < avance ? colorHecho : colorPendiente;
      c.fillRect(i * paso + paso * 0.2, (alto - altura) / 2, paso * 0.6, altura);
    });
    tiempo.textContent = formatoTiempo(audio.currentTime) + " / " + formatoTiempo(duracion());
  }

  function bucle() {
    dibujar();
    if (!audio.paused) animacion = requestAnimationFrame(bucle);
  }

  audio.addEventListener("play", () => { boton.textContent = "Pausa"; bucle(); });
  audio.addEventListener("pause", () => { boton.textContent = "Reproducir"; cancelAnimationFrame(animacion); dibujar(); });
  audio.addEventListener("ended", () => { audio.currentTime = 0; dibujar(); });

  boton.addEventListener("click", () => {
    if (audio.paused) {
      pararOtroReproductor(audio);
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  });

  // Tocar la onda mueve la reproducción a ese punto.
  lienzo.addEventListener("pointerdown", (evento) => {
    const caja = lienzo.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (evento.clientX - caja.left) / caja.width)) * duracion();
    dibujar();
  });

  async function abrir() {
    if (!audio.src) {
      const registro = await BD.leerAudio(sonido.id);
      picos = calcularPicos(registro.datos, 90);
      audio.src = URL.createObjectURL(new Blob([registro.datos], { type: "audio/wav" }));
    }
    elemento.hidden = false;
    dibujar();
    pararOtroReproductor(audio);
    audio.play().catch(() => {}); // si el móvil lo bloquea, se pulsa "Reproducir"
  }

  return { elemento, abrir };
}

function pararOtroReproductor(actual) {
  if (reproductorActivo && reproductorActivo !== actual) reproductorActivo.pause();
  reproductorActivo = actual;
}

function crearFila(sonido, noche) {
  const fila = crear("div", "", "fila");
  const cabecera = crear("div", "", "fila-cabecera");
  cabecera.append(crear("strong", textoHora(sonido.hora)), crear("span", textoDuracion(sonido.duracion)));

  const reproductor = crearReproductor(sonido);

  const acciones = crear("div", "", "fila-botones");
  const escuchar = crear("button", "Escuchar", "accion");
  escuchar.addEventListener("click", async () => {
    try {
      await reproductor.abrir();
    } catch (error) {
      escuchar.textContent = "No se pudo cargar";
    }
  });

  const guardar = crear("button", "Guardar", "texto");
  guardar.addEventListener("click", async () => {
    try {
      const registro = await BD.leerAudio(sonido.id);
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(new Blob([registro.datos], { type: "audio/wav" }));
      enlace.download = "sonido-" + new Date(sonido.hora).toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".wav";
      enlace.click();
    } catch (error) {
      guardar.textContent = "No se pudo guardar";
    }
  });

  const borrar = crear("button", "Borrar", "texto peligro");
  borrar.addEventListener("click", () => {
    pedirConfirmacion(acciones, "¿Borrar este sonido?", async () => {
      await BD.borrarSonidos([sonido.id]);
      mostrarSonidos(noche);
    }, () => acciones.replaceChildren(escuchar, guardar, borrar));
  });

  acciones.append(escuchar, guardar, borrar);
  fila.append(cabecera, acciones, reproductor.elemento);
  return fila;
}

function crearBorrarNoche(noche, sonidos) {
  const zona = crear("div", "", "zona-borrar");
  const boton = crear("button", "Borrar toda la noche", "texto peligro");
  boton.addEventListener("click", () => {
    pedirConfirmacion(zona, "¿Borrar " + plural(sonidos.length, "sonido", "sonidos") + " de esta noche?", async () => {
      await BD.borrarSonidos(sonidos.map((s) => s.id));
      mostrarNoches();
    }, () => zona.replaceChildren(boton));
  });
  zona.append(boton);
  return zona;
}

// Sustituye los botones por una pregunta con "Cancelar" y "Borrar".
function pedirConfirmacion(contenedor, pregunta, siConfirma, siCancela) {
  const cancelar = crear("button", "Cancelar", "texto");
  cancelar.addEventListener("click", siCancela);
  const confirmar = crear("button", "Borrar", "accion peligro-relleno");
  confirmar.addEventListener("click", async () => {
    confirmar.disabled = true;
    try {
      await siConfirma();
    } catch (error) {
      confirmar.textContent = "No se pudo borrar";
    }
  });
  contenedor.replaceChildren(crear("span", pregunta, "pregunta"), cancelar, confirmar);
}

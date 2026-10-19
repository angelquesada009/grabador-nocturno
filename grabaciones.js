// Pantalla "Grabaciones": lista de noches y, dentro de cada una, sus sonidos.
const vistaEscuchar = document.getElementById("vista-escuchar");
const vistaGrabaciones = document.getElementById("vista-grabaciones");
const pestanaEscuchar = document.getElementById("tab-escuchar");
const pestanaGrabaciones = document.getElementById("tab-grabaciones");
const lista = document.getElementById("lista");

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

// Crea un elemento HTML con texto y atributos.
function crear(etiqueta, texto, clase) {
  const e = document.createElement(etiqueta);
  if (texto) e.textContent = texto;
  if (clase) e.className = clase;
  return e;
}

function textoDuracion(segundos) {
  const total = Math.round(segundos);
  if (total < 60) return total + " s";
  return Math.floor(total / 60) + " min " + (total % 60) + " s";
}

function textoNoche(clave) {
  const [a, m, d] = clave.split("-").map(Number);
  const fecha = new Date(a, m - 1, d).toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long",
  });
  return "Noche del " + fecha;
}

function textoHora(marcaTiempo) {
  return new Date(marcaTiempo).toLocaleTimeString("es-ES", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ----- Lista de noches -----
async function mostrarNoches() {
  lista.replaceChildren(crear("h2", "Noches grabadas"));

  let sonidos;
  try {
    sonidos = await BD.listarSonidos();
  } catch (error) {
    lista.append(crear("p", "No se pudieron leer las grabaciones."));
    return;
  }

  if (sonidos.length === 0) {
    lista.append(crear("p", "Todavía no hay grabaciones."));
    return;
  }

  const noches = {};
  sonidos.forEach((s) => {
    noches[s.noche] = noches[s.noche] || { cantidad: 0, duracion: 0 };
    noches[s.noche].cantidad++;
    noches[s.noche].duracion += s.duracion;
  });

  Object.keys(noches).sort().reverse().forEach((clave) => {
    const datos = noches[clave];
    const tarjeta = crear("button", "", "tarjeta");
    tarjeta.append(
      crear("strong", textoNoche(clave)),
      crear("span", datos.cantidad + " sonidos · " + textoDuracion(datos.duracion))
    );
    tarjeta.addEventListener("click", () => mostrarSonidos(clave));
    lista.append(tarjeta);
  });
}

// ----- Sonidos de una noche -----
async function mostrarSonidos(noche) {
  lista.replaceChildren();

  const volver = crear("button", "← Todas las noches", "secundario");
  volver.addEventListener("click", mostrarNoches);
  lista.append(volver, crear("h2", textoNoche(noche)));

  const sonidos = (await BD.sonidosDeNoche(noche)).sort((a, b) => a.hora - b.hora);

  sonidos.forEach((sonido) => {
    const fila = crear("div", "", "fila");
    const cabecera = crear("div", "", "fila-cabecera");
    cabecera.append(crear("strong", textoHora(sonido.hora)), crear("span", textoDuracion(sonido.duracion)));

    const reproductor = document.createElement("audio");
    reproductor.controls = true;
    reproductor.hidden = true;

    const escuchar = crear("button", "▶ Escuchar");
    escuchar.addEventListener("click", async () => {
      if (!reproductor.src) {
        const registro = await BD.leerAudio(sonido.id);
        reproductor.src = URL.createObjectURL(new Blob([registro.datos], { type: "audio/wav" }));
      }
      reproductor.hidden = false;
      reproductor.play().catch(() => {}); // si el móvil lo bloquea, se pulsa play en el reproductor
    });

    const borrar = crear("button", "Borrar", "peligro");
    borrar.addEventListener("click", async () => {
      if (!confirm("¿Borrar este sonido?")) return;
      await BD.borrarSonidos([sonido.id]);
      mostrarSonidos(noche);
    });

    const botones = crear("div", "", "fila-botones");
    botones.append(escuchar, borrar);
    fila.append(cabecera, botones, reproductor);
    lista.append(fila);
  });

  const borrarNoche = crear("button", "Borrar toda la noche", "peligro");
  borrarNoche.addEventListener("click", async () => {
    if (!confirm("¿Borrar los " + sonidos.length + " sonidos de esta noche?")) return;
    await BD.borrarSonidos(sonidos.map((s) => s.id));
    mostrarNoches();
  });
  lista.append(borrarNoche);
}

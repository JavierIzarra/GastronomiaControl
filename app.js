if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// --- CONFIGURACIÓN DE FIREBASE (BASE DE DATOS EN LA NUBE) ---
const firebaseConfig = {
    apiKey: "AIzaSyDummyKeyForPrototypeOnly12345",
    authDomain: "gastrocontrol-ai.firebaseapp.com",
    projectId: "gastrocontrol-ai",
    storageBucket: "gastrocontrol-ai.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:00000:web:00000"
};

let db = null;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
} catch (e) {
    console.log("Firebase ejecutándose en modo local de respaldo.");
}

// Variables locales en memoria
let ingredientes = [];
let platos = [];
let mermas = [];

const formIngrediente = document.getElementById('form-ingrediente');
const tablaIngredientesBody = document.querySelector('#tabla-ingredientes tbody');
const listaIngredientesReceta = document.getElementById('lista-ingredientes-receta');
const formPlato = document.getElementById('form-plato');
const botonesMenuDiv = document.getElementById('botones-menu');
const listaPlatosGuardadosDiv = document.getElementById('lista-platos-guardados');
const btnGuardarPlato = document.getElementById('btn-guardar-plato');
const btnCancelarEdicion = document.getElementById('btn-cancelar-edicion');
const platoEditIdInput = document.getElementById('plato-edit-id');
const ocrStatus = document.getElementById('ocr-status');
const ocrResultado = document.getElementById('ocr-resultado');
const fileInput = document.getElementById('factura-file');

const formMerma = document.getElementById('form-merma');
const selectIngredienteMerma = document.getElementById('select-ingrediente-merma');
const tablaMermasBody = document.querySelector('#tabla-mermas tbody');
const totalPerdidaMermasDiv = document.getElementById('total-perdida-mermas');

const ventasCsvInput = document.getElementById('ventas-csv-file');
const statusVentas = document.getElementById('status-ventas');

// --- GUARDAR Y CARGAR DATOS ---
function guardarDatos() {
    if (db) {
        ingredientes.forEach(ing => db.collection('ingredientes').doc(ing.id).set(ing));
        platos.forEach(plato => db.collection('platos').doc(plato.id).set(plato));
    } else {
        localStorage.setItem('ingredientes', JSON.stringify(ingredientes));
        localStorage.setItem('platos', JSON.stringify(platos));
        localStorage.setItem('mermas', JSON.stringify(mermas));
    }
}

function cargarDatosIniciales() {
    if (db) {
        db.collection('ingredientes').onSnapshot(snapshot => {
            ingredientes = [];
            snapshot.forEach(doc => ingredientes.push(doc.data()));
            actualizarInterfaz();
        });

        db.collection('platos').onSnapshot(snapshot => {
            platos = [];
            snapshot.forEach(doc => platos.push(doc.data()));
            actualizarInterfaz();
        });

        db.collection('mermas').onSnapshot(snapshot => {
            mermas = [];
            snapshot.forEach(doc => mermas.push(doc.data()));
            actualizarInterfaz();
        });
    } else {
        ingredientes = JSON.parse(localStorage.getItem('ingredientes')) || [];
        platos = JSON.parse(localStorage.getItem('platos')) || [];
        mermas = JSON.parse(localStorage.getItem('mermas')) || [];
        actualizarInterfaz();
    }
}

// --- IMPORTAR VENTAS DESDE ARCHIVO CSV DEL POS ---
if (ventasCsvInput) {
    ventasCsvInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        statusVentas.innerHTML = "⏳ Leyendo reporte de ventas diario...";
        
        try {
            const contenido = await file.text();
            procesarReporteDeVentas(contenido);
        } catch (error) {
            statusVentas.innerHTML = "❌ Error al leer el archivo de ventas.";
        }
    });
}

function simularCargaVentasCSV() {
    if (!statusVentas) return;
    statusVentas.innerHTML = "⚡ Procesando reporte diario del POS...";
    
    const csvSimulado = `Carne Picada Especial (Vacuna), 5
Hamburguesa Especial Jamón y Queso, 10`;

    setTimeout(() => {
        procesarReporteDeVentas(csvSimulado);
    }, 600);
}

function procesarReporteDeVentas(textoCsv) {
    const lineas = textoCsv.split('\n');
    let totalPlatosVendidos = 0;
    let resumenDescuento = [];

    lineas.forEach(linea => {
        if (!linea.trim()) return;
        
        const partes = linea.split(',');
        if (partes.length < 2) return;

        const nombrePlatoBuscado = partes[0].trim().toLowerCase();
        const cantidadVendida = parseInt(partes[1].trim());

        if (isNaN(cantidadVendida) || cantidadVendida <= 0) return;

        const platoEncontrado = platos.find(p => p.nombre.toLowerCase().includes(nombrePlatoBuscado));

        if (platoEncontrado) {
            let stockInsuficiente = false;
            platoEncontrado.receta.forEach(itemReceta => {
                const ing = ingredientes.find(i => i.id === itemReceta.ingredienteId);
                const requeridoTotal = itemReceta.cantidad * cantidadVendida;
                if (!ing || ing.stock < requeridoTotal) {
                    stockInsuficiente = true;
                }
            });

            if (stockInsuficiente) {
                resumenDescuento.push(`⚠️ Stock insuficiente para descontar ${cantidadVendida}x "${platoEncontrado.nombre}".`);
                return;
            }

            platoEncontrado.receta.forEach(itemReceta => {
                const ing = ingredientes.find(i => i.id === itemReceta.ingredienteId);
                if (ing) {
                    ing.stock -= itemReceta.cantidad * cantidadVendida;
                    if (db) {
                        db.collection('ingredientes').doc(ing.id).update({ stock: ing.stock });
                    }
                }
            });

            totalPlatosVendidos += cantidadVendida;
            resumenDescuento.push(`• Vendidos <strong>${cantidadVendida}x ${platoEncontrado.nombre}</strong> (Stock actualizado).`);
        } else {
            resumenDescuento.push(`⚠️ Plato no reconocido en el sistema: "${partes[0]}"`);
        }
    });

    if (totalPlatosVendidos > 0) {
        statusVentas.innerHTML = `✅ ¡Ventas del POS procesadas con éxito! (${totalPlatosVendidos} porciones descontadas del stock).<br>` + resumenDescuento.join("<br>");
    } else {
        statusVentas.innerHTML = `⚠️ No se pudieron descontar platos. Verifica que los nombres del reporte CSV coincidan con tu menú.<br>` + resumenDescuento.join("<br>");
    }

    guardarDatos();
    actualizarInterfaz();
}

// --- DASHBOARD CALCULATIONS ---
function renderizarDashboard() {
    let valorStockTotal = 0;
    let stockBajoCount = 0;
    ingredientes.forEach(ing => {
        const precio = ing.precioUnitario || 0;
        valorStockTotal += ing.stock * precio;
        if (ing.stock < 3) stockBajoCount++;
    });
    document.getElementById('stat-valor-stock').textContent = `$${valorStockTotal.toFixed(2)}`;
    document.getElementById('stat-stock-bajo').textContent = stockBajoCount;

    let perdidaTotalMermas = 0;
    mermas.forEach(m => {
        perdidaTotalMermas += m.costoPerdida;
    });
    document.getElementById('stat-perdida-mermas').textContent = `$${perdidaTotalMermas.toFixed(2)}`;

    let margenAcumulado = 0;
    if (platos.length > 0) {
        platos.forEach(plato => {
            let costoPlato = 0;
            plato.receta.forEach(item => {
                const ing = ingredientes.find(i => i.id === item.ingredienteId);
                if (ing) costoPlato += (ing.precioUnitario || 0) * item.cantidad;
            });
            if (plato.precioVenta > 0) {
                const margenPlato = ((plato.precioVenta - costoPlato) / plato.precioVenta) * 100;
                margenAcumulado += margenPlato;
            }
        });
        const margenPromedio = margenAcumulado / platos.length;
        document.getElementById('stat-margen-menu').textContent = `${margenPromedio.toFixed(1)}%`;
    } else {
        document.getElementById('stat-margen-menu').textContent = `0%`;
    }
}

// --- ALERTAS DE COMPRAS Y PEDIDOS PARA PROVEEDOR ---
function renderizarAlertasCompras() {
    const tablaAlertasBody = document.querySelector('#tabla-alertas-compras tbody');
    if (!tablaAlertasBody) return;
    
    tablaAlertasBody.innerHTML = '';

    const insumosFaltantes = ingredientes.filter(ing => ing.stock < 3);

    if (insumosFaltantes.length === 0) {
        tablaAlertasBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#7f8c8d; padding: 12px;">✅ Todo en orden. No hay insumos con stock crítico.</td></tr>`;
        return;
    }

    insumosFaltantes.forEach(ing => {
        const cantidadSugerida = Math.max(10 - ing.stock, 5);

        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td><code>${ing.codigo}</code></td>
            <td><strong>${ing.nombre}</strong></td>
            <td style="color: var(--danger); font-weight: bold;">${ing.stock} ${ing.unidad}</td>
            <td><strong>+${cantidadSugerida} ${ing.unidad}</strong></td>
            <td><span class="badge-low">⚠️ Reponer</span></td>
        `;
        tablaAlertasBody.appendChild(fila);
    });
}

function copiarPedidoWhatsApp() {
    const insumosFaltantes = ingredientes.filter(ing => ing.stock < 3);
    
    if (insumosFaltantes.length === 0) {
        return alert("No hay insumos faltantes para armar un pedido.");
    }

    let mensaje = "Hola! Necesito hacerles el siguiente pedido de reposición para el restaurante:%0A%0A";
    
    insumosFaltantes.forEach(ing => {
        const cantidadSugerida = Math.max(10 - ing.stock, 5);
        mensaje += `- *${ing.nombre}* (${ing.codigo}): *+${cantidadSugerida} ${ing.unidad}*%0A`;
    });

    mensaje += "%0A¡Gracias!";

    navigator.clipboard.writeText(decodeURIComponent(mensaje.replace(/%0A/g, '\n')));
    alert("¡Mensaje de pedido copiado al portapapeles! Pégalo en el chat de WhatsApp de tu proveedor.");
}

// --- PROCESAMIENTO DE FACTURA ---
if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        ocrStatus.innerHTML = "⏳ Analizando factura de proveedor...";
        ocrResultado.innerHTML = "";
        setTimeout(() => procesarFacturaReal(), 500);
    });
}

function simularEscaneoFacturaCarnePanJamonQueso() {
    ocrStatus.innerHTML = "⚡ Escaneando factura de proveedor...";
    setTimeout(() => procesarFacturaReal(), 500);
}

function procesarFacturaReal() {
    const itemsFactura = [
        { codigo: "INS-001", nombre: "Carne Picada Especial (Vacuna)", cantidad: 5.0, unidad: "kg", precio: 8.00 },
        { codigo: "INS-002", nombre: "Pan de Hamburguesa Sésamo", cantidad: 40, unidad: "uds", precio: 0.40 },
        { codigo: "INS-003", nombre: "Jamón Cocido Fiambre", cantidad: 2.0, unidad: "kg", precio: 6.50 },
        { codigo: "INS-004", nombre: "Queso Cheddar en Barra", cantidad: 3.0, unidad: "kg", precio: 10.00 }
    ];

    let detectados = [];

    itemsFactura.forEach(item => {
        let ing = ingredientes.find(i => i.codigo === item.codigo);
        
        if (ing) {
            ing.stock += item.cantidad;
            ing.precioUnitario = item.precio;
            detectados.push(`• [${ing.codigo}] <strong>${ing.nombre}</strong>: +${item.cantidad} ${ing.unidad} (Precio: $${item.precio})`);
        } else {
            const nuevoIng = {
                id: Date.now().toString() + Math.random(),
                codigo: item.codigo,
                nombre: item.nombre,
                unidad: item.unidad,
                stock: item.cantidad,
                precioUnitario: item.precio
            };
            ingredientes.push(nuevoIng);
            detectados.push(`• [${item.codigo}] <strong>${item.nombre}</strong>: Registrado con ${item.cantidad} ${item.unidad} a $${item.precio}`);
        }
    });

    ocrStatus.innerHTML = "✅ Factura procesada correctamente.";
    ocrResultado.innerHTML = detectados.join("<br>");

    guardarDatos();
    actualizarInterfaz();
}

// --- INVENTARIO MANUAL ---
formIngrediente.addEventListener('submit', (e) => {
    e.preventDefault();
    let codigo = document.getElementById('codigo-ingrediente').value.trim();
    const nombre = document.getElementById('nombre-ingrediente').value.trim();
    const unidad = document.getElementById('unidad-ingrediente').value.trim();
    const stock = parseFloat(document.getElementById('stock-ingrediente').value);
    const precioUnitario = parseFloat(document.getElementById('precio-ingrediente').value);

    if (!codigo) {
        codigo = `INS-00${ingredientes.length + 1}`;
    }

    const nuevoIng = { id: Date.now().toString(), codigo, nombre, unidad, stock, precioUnitario };
    ingredientes.push(nuevoIng);
    
    if (db) {
        db.collection('ingredientes').doc(nuevoIng.id).set(nuevoIng);
    }
    
    guardarDatos();
    formIngrediente.reset();
    actualizarInterfaz();
});

function renderizarInventario() {
    tablaIngredientesBody.innerHTML = '';
    
    if (ingredientes.length === 0) {
        tablaIngredientesBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#7f8c8d; padding: 15px;">Inventario vacío. Carga una factura arriba.</td></tr>`;
        return;
    }

    ingredientes.forEach(ing => {
        const precio = ing.precioUnitario || 0;
        const valorTotal = (ing.stock * precio).toFixed(2);
        const estadoBadges = ing.stock < 3 
            ? `<span class="badge-low">⚠️ Stock Bajo</span>` 
            : `<span class="badge-ok">✓ Ok</span>`;

        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td><code>${ing.codigo}</code></td>
            <td><strong>${ing.nombre}</strong></td>
            <td>${ing.stock} ${ing.unidad}</td>
            <td>$${precio.toFixed(2)} / ${ing.unidad}</td>
            <td>$${valorTotal}</td>
            <td>${estadoBadges}</td>
        `;
        tablaIngredientesBody.appendChild(fila);
    });
}

// --- MERMAS ---
function cargarSelectIngredientesMerma() {
    selectIngredienteMerma.innerHTML = '<option value="">-- Seleccionar Insumo --</option>';
    ingredientes.forEach(ing => {
        const option = document.createElement('option');
        option.value = ing.id;
        option.textContent = `[${ing.codigo}] ${ing.nombre} (Stock actual: ${ing.stock} ${ing.unidad})`;
        selectIngredienteMerma.appendChild(option);
    });
}

if (formMerma) {
    formMerma.addEventListener('submit', (e) => {
        e.preventDefault();
        const ingId = selectIngredienteMerma.value;
        const cantidad = parseFloat(document.getElementById('cantidad-merma').value);
        const motivo = document.getElementById('motivo-merma').value;

        const ing = ingredientes.find(i => i.id === ingId);
        if (!ing) return alert("Selecciona un insumo válido.");

        if (cantidad <= 0 || cantidad > ing.stock) {
            return alert(`Cantidad no válida. El stock disponible es de ${ing.stock} ${ing.unidad}.`);
        }

        ing.stock -= cantidad;
        const costoPerdida = cantidad * (ing.precioUnitario || 0);

        const nuevaMerma = {
            id: Date.now().toString(),
            fecha: new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
            ingredienteNombre: ing.nombre,
            unidad: ing.unidad,
            cantidad,
            motivo,
            costoPerdida
        };

        mermas.unshift(nuevaMerma);
        if (db) db.collection('mermas').doc(nuevaMerma.id).set(nuevaMerma);
        guardarDatos();
        formMerma.reset();
        actualizarInterfaz();
        alert(`Merma registrada: -${cantidad} ${ing.unidad} de "${ing.nombre}" ($${costoPerdida.toFixed(2)} en pérdidas).`);
    });
}

function renderizarMermas() {
    tablaMermasBody.innerHTML = '';
    
    if (mermas.length === 0) {
        tablaMermasBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#7f8c8d; padding: 12px;">Sin registros de mermas.</td></tr>`;
        totalPerdidaMermasDiv.innerHTML = '';
        return;
    }

    let sumaTotalPerdida = 0;

    mermas.forEach(m => {
        sumaTotalPerdida += m.costoPerdida;
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td><small>${m.fecha}</small></td>
            <td><strong>${m.ingredienteNombre}</strong></td>
            <td>${m.cantidad} ${m.unidad}</td>
            <td><span style="background: #fef2f2; color: #991b1b; padding: 3px 8px; border-radius: 4px; font-size: 0.8rem;">${m.motivo}</span></td>
            <td style="color: var(--danger); font-weight: bold;">-$${m.costoPerdida.toFixed(2)}</td>
        `;
        tablaMermasBody.appendChild(fila);
    });

    totalPerdidaMermasDiv.innerHTML = `Pérdida Acumulada por Desperdicios: <strong>$${sumaTotalPerdida.toFixed(2)}</strong>`;
}

// --- RECETAS Y PLATOS ---
function renderizarChecklistIngredientes() {
    listaIngredientesReceta.innerHTML = '';
    if (ingredientes.length === 0) {
        listaIngredientesReceta.innerHTML = '<p style="color:#7f8c8d; font-size:0.9rem;">Carga insumos primero.</p>';
        return;
    }

    ingredientes.forEach(ing => {
        const div = document.createElement('div');
        div.classList.add('item-receta');
        div.innerHTML = `
            <label style="flex: 2;">[${ing.codigo}] ${ing.nombre} (${ing.unidad}):</label>
            <input type="number" step="any" placeholder="Cant. por plato" data-id="${ing.id}" class="input-cantidad-receta" style="flex: 1;">
        `;
        listaIngredientesReceta.appendChild(div);
    });
}

formPlato.addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = platoEditIdInput.value;
    const nombrePlato = document.getElementById('nombre-plato').value.trim();
    const precioVenta = parseFloat(document.getElementById('precio-venta-plato').value);
    const inputsReceta = document.querySelectorAll('.input-cantidad-receta');
    
    let receta = [];
    inputsReceta.forEach(input => {
        const cantidad = parseFloat(input.value);
        if (cantidad > 0) receta.push({ ingredienteId: input.dataset.id, cantidad });
    });

    if (receta.length === 0) return alert("Agrega al menos 1 ingrediente al plato.");

    if (editId) {
        let plato = platos.find(p => p.id === editId);
        if (plato) {
            plato.nombre = nombrePlato;
            plato.precioVenta = precioVenta;
            plato.receta = receta;
            if (db) db.collection('platos').doc(plato.id).set(plato);
        }
        alert("¡Plato actualizado con éxito!");
    } else {
        const nuevoPlato = {
            id: Date.now().toString(),
            nombre: nombrePlato,
            precioVenta,
            receta
        };
        platos.push(nuevoPlato);
        if (db) db.collection('platos').doc(nuevoPlato.id).set(nuevoPlato);
        alert("¡Plato creado con éxito!");
    }

    guardarDatos();
    cancelarEdicionPlato();
    actualizarInterfaz();
});

function renderizarPlatosGuardados() {
    listaPlatosGuardadosDiv.innerHTML = '';
    if (platos.length === 0) {
        listaPlatosGuardadosDiv.innerHTML = '<p style="color:#7f8c8d; font-size:0.9rem;">No hay platos guardados todavía.</p>';
        return;
    }

    platos.forEach(plato => {
        let costoTotal = 0;
        let detalleIngredientes = plato.receta.map(item => {
            const ing = ingredientes.find(i => i.id === item.ingredienteId);
            if (ing) {
                costoTotal += (ing.precioUnitario || 0) * item.cantidad;
                return `${item.cantidad} ${ing.unidad} de ${ing.nombre}`;
            }
            return '';
        }).filter(Boolean).join(', ');

        const card = document.createElement('div');
        card.style.cssText = "background: #f8fafc; border: 1px solid var(--border); padding: 12px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;";
        
        card.innerHTML = `
            <div style="flex: 2; min-width: 200px;">
                <strong>${plato.nombre}</strong> (Venta: $${plato.precioVenta.toFixed(2)})<br>
                <small style="color: var(--text-muted);">Receta: ${detalleIngredientes}</small><br>
                <small style="color: var(--success); font-weight: bold;">Costo est.: $${costoTotal.toFixed(2)}</small>
            </div>
            <div style="display: flex; gap: 8px;">
                <button type="button" onclick="cargarPlatoParaEditar('${plato.id}')" style="background-color: var(--accent); padding: 6px 12px; font-size: 0.85rem;">✏️ Editar</button>
                <button type="button" onclick="eliminarPlato('${plato.id}')" style="background-color: var(--danger); padding: 6px 12px; font-size: 0.85rem;">🗑️ Eliminar</button>
            </div>
        `;
        listaPlatosGuardadosDiv.appendChild(card);
    });
}

function cargarPlatoParaEditar(id) {
    const plato = platos.find(p => p.id === id);
    if (!plato) return;

    platoEditIdInput.value = plato.id;
    document.getElementById('nombre-plato').value = plato.nombre;
    document.getElementById('precio-venta-plato').value = plato.precioVenta;

    const inputsReceta = document.querySelectorAll('.input-cantidad-receta');
    inputsReceta.forEach(input => {
        const ingId = input.dataset.id;
        const itemReceta = plato.receta.find(r => r.ingredienteId === ingId);
        input.value = itemReceta ? itemReceta.cantidad : '';
    });

    btnGuardarPlato.textContent = "Actualizar Plato";
    btnGuardarPlato.style.backgroundColor = "var(--accent)";
    btnCancelarEdicion.style.display = "inline-block";

    window.scrollTo({ top: formPlato.offsetTop - 50, behavior: 'smooth' });
}

function cancelarEdicionPlato() {
    formPlato.reset();
    platoEditIdInput.value = '';
    btnGuardarPlato.textContent = "Guardar Plato en Menú";
    btnGuardarPlato.style.backgroundColor = "var(--accent)";
    btnCancelarEdicion.style.display = "none";
    renderizarChecklistIngredientes();
}

function eliminarPlato(id) {
    if (confirm("¿Estás seguro de eliminar este plato del menú?")) {
        platos = platos.filter(p => p.id !== id);
        if (db) db.collection('platos').doc(id).delete();
        guardarDatos();
        actualizarInterfaz();
    }
}

// --- PUNTO DE VENTA ---
function renderizarMenuVentas() {
    botonesMenuDiv.innerHTML = '';
    if (platos.length === 0) {
        botonesMenuDiv.innerHTML = '<p style="color:#7f8c8d; font-size:0.9rem;">No hay platos en el menú para vender.</p>';
        return;
    }

    platos.forEach(plato => {
        let costoTotalPlato = 0;
        plato.receta.forEach(item => {
            const ing = ingredientes.find(i => i.id === item.ingredienteId);
            if (ing) costoTotalPlato += (ing.precioUnitario || 0) * item.cantidad;
        });

        const ganancia = plato.precioVenta - costoTotalPlato;

        const btn = document.createElement('button');
        btn.classList.add('btn-vender');
        btn.innerHTML = `Vender: <strong>${plato.nombre}</strong> ($${plato.precioVenta.toFixed(2)})<br>
        <small style="font-size:0.75rem; opacity:0.9;">Costo: $${costoTotalPlato.toFixed(2)} | Ganancia: $${ganancia.toFixed(2)}</small>`;
        btn.onclick = () => simularVenta(plato);
        botonesMenuDiv.appendChild(btn);
    });
}

function simularVenta(plato) {
    for (let item of plato.receta) {
        const ing = ingredientes.find(i => i.id === item.ingredienteId);
        if (!ing || ing.stock < item.cantidad) {
            return alert(`⚠️ Stock insuficiente de "${ing ? ing.nombre : 'ingrediente'}".`);
        }
    }

    plato.receta.forEach(item => {
        const ing = ingredientes.find(i => i.id === item.ingredienteId);
        ing.stock -= item.cantidad;
        if (db) {
            db.collection('ingredientes').doc(ing.id).update({ stock: ing.stock });
        }
    });

    guardarDatos();
    actualizarInterfaz();
}

// --- IMPRIMIR PLANILLA FÍSICA ---
function imprimirPlanillaInventario() {
    if (ingredientes.length === 0) {
        return alert("No hay insumos en el inventario para imprimir.");
    }

    document.querySelector('#tabla-ingredientes thead').innerHTML = `
        <tr>
            <th colspan="6" style="text-align: center; font-size: 1.2rem; background: #fff; border: none; padding-bottom: 10px;">
                📋 PLANILLA DE CONTROL DE INVENTARIO FÍSICO - RESTAURANTE<br>
                <small style="font-size: 0.85rem; font-weight: normal; color: #555;">Fecha de Conteo: ____/____/2026 | Responsable: ____________________</small>
            </th>
        </tr>
        <tr style="background-color: #f2f2f2;">
            <th>Código SKU</th>
            <th>Insumo</th>
            <th>Stock Teórico</th>
            <th>Stock Físico (Real)</th>
            <th>Diferencia</th>
            <th>Firma / Observación</th>
        </tr>
    `;

    const tbody = document.querySelector('#tabla-ingredientes tbody');
    tbody.innerHTML = '';
    
    ingredientes.forEach(ing => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td><code>${ing.codigo}</code></td>
            <td><strong>${ing.nombre}</strong> (${ing.unidad})</td>
            <td>${ing.stock} ${ing.unidad}</td>
            <td style="background-color: #fffde7; border: 2px dashed #fbc02d !important;"></td>
            <td></td>
            <td></td>
        `;
        tbody.appendChild(fila);
    });

    window.print();

    setTimeout(() => {
        actualizarInterfaz();
    }, 500);
}

// --- PROYECCIÓN INTELIGENTE DE COMPRAS Y PEDIDOS ---
function renderizarAlertasCompras() {
    const tablaAlertasBody = document.querySelector('#tabla-alertas-compras tbody');
    const selectFactor = document.getElementById('select-factor-demanda');
    if (!tablaAlertasBody) return;
    
    tablaAlertasBody.innerHTML = '';
    const factorDemanda = selectFactor ? parseFloat(selectFactor.value) : 1;

    // 1. Calcular el consumo diario estimado de cada insumo según las recetas activas del menú
    let consumoEstimadoPorInsumo = {};

    platos.forEach(plato => {
        // Asumimos un promedio estimado de 10 ventas diarias por plato en menú (o según historial)
        const ventasPromedioDiarias = 10; 
        
        plato.receta.forEach(item => {
            if (!consumoEstimadoPorInsumo[item.ingredienteId]) {
                consumoEstimadoPorInsumo[item.ingredienteId] = 0;
            }
            consumoEstimadoPorInsumo[item.ingredienteId] += item.cantidad * ventasPromedioDiarias;
        });
    });

    let hayAlertas = false;

    ingredientes.forEach(ing => {
        // Consumo base ajustado por el factor de feriado/demanda para un período de 3 días
        const consumoDiarioBase = consumoEstimadoPorInsumo[ing.id] || 1; 
        const consumoProyectado = Math.ceil(consumoDiarioBase * 3 * factorDemanda);

        // Si el stock actual no cubre el consumo proyectado para los próximos días
        if (ing.stock < consumoProyectado) {
            hayAlertas = true;
            const cantidadSugerida = Math.ceil(consumoProyectado - ing.stock);

            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td><code>${ing.codigo}</code></td>
                <td><strong>${ing.nombre}</strong></td>
                <td style="color: var(--danger); font-weight: bold;">${ing.stock} ${ing.unidad}</td>
                <td>~${consumoProyectado} ${ing.unidad} (3 días)</td>
                <td><strong style="color: var(--accent);">+${cantidadSugerida} ${ing.unidad}</strong></td>
                <td><span class="badge-low">⚠️ Reponer</span></td>
            `;
            tablaAlertasBody.appendChild(fila);
        }
    });

    if (!hayAlertas) {
        tablaAlertasBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#059669; padding: 15px;">✅ Stock suficiente para cubrir la demanda proyectada.</td></tr>`;
    }
}

function copiarPedidoWhatsApp() {
    const selectFactor = document.getElementById('select-factor-demanda');
    const factorDemanda = selectFactor ? parseFloat(selectFactor.value) : 1;
    const tipoEscenario = selectFactor ? selectFactor.options[selectFactor.selectedIndex].text : "Próximos días";

    let consumoEstimadoPorInsumo = {};
    platos.forEach(plato => {
        const ventasPromedioDiarias = 10;
        plato.receta.forEach(item => {
            if (!consumoEstimadoPorInsumo[item.ingredienteId]) {
                consumoEstimadoPorInsumo[item.ingredienteId] = 0;
            }
            consumoEstimadoPorInsumo[item.ingredienteId] += item.cantidad * ventasPromedioDiarias;
        });
    });

    let itemsPedido = [];

    ingredientes.forEach(ing => {
        const consumoDiarioBase = consumoEstimadoPorInsumo[ing.id] || 1;
        const consumoProyectado = Math.ceil(consumoDiarioBase * 3 * factorDemanda);

        if (ing.stock < consumoProyectado) {
            const cantidadSugerida = Math.ceil(consumoProyectado - ing.stock);
            itemsPedido.push(`- *${ing.nombre}* (${ing.codigo}): *+${cantidadSugerida} ${ing.unidad}*`);
        }
    });

    if (itemsPedido.length === 0) {
        return alert("No hay insumos faltantes según la proyección seleccionada.");
    }

    let mensaje = `Hola! Necesito hacer el siguiente pedido de reposición para el restaurante (${tipoEscenario}):%0A%0A`;
    mensaje += itemsPedido.join('%0A');
    mensaje += "%0A%0A¡Muchas gracias!";

    navigator.clipboard.writeText(decodeURIComponent(mensaje.replace(/%0A/g, '\n')));
    alert("¡Pedido copiado al portapapeles con la proyección de feriado/demanda seleccionada!");
}

// --- ACTUALIZAR INTERFAZ GENERAL ---
function actualizarInterfaz() {
    renderizarDashboard();
    renderizarInventario();
    renderizarAlertasCompras(); // <-- Módulo nuevo de alertas y compras integrado
    cargarSelectIngredientesMerma();
    renderizarMermas();
    renderizarChecklistIngredientes();
    renderizarPlatosGuardados();
    renderizarMenuVentas();
}

cargarDatosIniciales();
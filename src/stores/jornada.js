import { defineStore } from 'pinia';
import { Timestamp, query, collection, doc, getDocs, addDoc, orderBy, deleteDoc, getDoc, updateDoc, setDoc } from 'firebase/firestore/lite';
import { db } from '../firebaseConfig';
import { useOrdenesStore } from './ordenes';
import { useMensajesStore } from './mensajes';
import { fechaFormateada, fechaFormateadaCorta, horaFormateada } from '../utilidades';

export const useJornadaStore = defineStore('jornada', {
    state: () => ({
        jornadaActiva: false
    }), 
    getters: {
        jornadaValor(state) {
            return state.jornadaActiva;
        }
    },  
    actions: {
        async empezarJornada() {
            const mensajesStore = useMensajesStore();
            try {
                const docRef = doc(db, 'jornada', 'estadoId');
                await updateDoc(docRef, {
                    jornadaActiva: true
                });
                this.jornadaActiva = true; 

                mensajesStore.crearMensaje({
                    titulo: 'Nueva jornada', 
                    texto: `Jornada iniciada el ${fechaFormateada(new Date())} a las ${horaFormateada(new Date())} `, 
                    color: 'success', 
                    id: 'mensajeIniciarJornada',
                    autoEliminar: true
                });
            } catch (error) {
                mensajesStore.crearError('noInicioJornada', 'No se pudo iniciar la jornada');
                console.log(error);
            }
        }, 
        async estadoJornada() {
            const mensajesStore = useMensajesStore();
            try {
                const docRef = doc(db, "jornada", "estadoId");
                const docSnap = await getDoc(docRef);
                this.jornadaActiva = docSnap.data().jornadaActiva;
            } catch (error) {
                mensajesStore.crearError('noComprobacionJornada', 'No se pudo comprobar el estado de la jornada');
                console.log(error);
            }
        },
        async terminarJornada() {
            const mensajesStore = useMensajesStore();

            //validacion para que no se pueda terminar la jornada con ordenes aun pendientes
            const ordenesStore = useOrdenesStore(); 
            const hayPendientes = ordenesStore.ordenes 
                .some(orden => (orden.estado === 'preparacion') || (orden.estado === 'tardada'));
            if (hayPendientes) {
                mensajesStore.crearMensaje({
                    titulo: 'Advertencia', 
                    texto: 'No puede cerrar la jornada con órdenes activas', 
                    color: 'warning', 
                    id: 'mensajeTratarCerrarJornada',
                    autoEliminar: true
                });
                return;
            }
            
            try {
                // indicando que la jornada ha acabado
                const docRefJornada = doc(db, 'jornada', 'estadoId');
                await updateDoc(docRefJornada, {
                    jornadaActiva: false
                });
                this.jornadaActiva = false;

                /******  generando el resumen de todas las ordenes de la jornada, para el historial de ordenes  ****/
                  

                // validaciones 
                if (ordenesStore.cantidadOrdenes == 0) { 
                    mensajesStore.crearMensaje({
                        titulo: 'Jornada finalizada', 
                        texto: 'No se añade al historial porque no se realizó ninguna orden', 
                        color: 'success', 
                        id: 'jornadaFinalizadaNoCreada',
                        autoEliminar: true
                    });
                    return;
                }

                const ordenesCompletadasTemp = ordenesStore.ordenes.filter(orden => orden.estado === 'completada');
                const ordenesCanceladasTemp = ordenesStore.ordenes.filter(orden => orden.estado === 'cancelada');
                
                // se ganancias y ventas totales a lo largo de la jornada
                let objJornada = {
                    ordenesCompletadas: ordenesCompletadasTemp.length,
                    ordenesCanceladas: ordenesCanceladasTemp.length,
                    gananciasTotales: 0,   // dinero
                    gananciasPerdidas: 0,   // dinero
                    jornadaFecha: Timestamp.now(), // marca de tiempo de firestore, debe ser convertida a Date de JS 
                    quesoTot: 0,  // cantidad de producto vendido
                    revueltasTot: 0,
                    chicharronTot: 0,
                    gaseosaTot: 0,
                    refrescoTot: 0,
                    chocolateTot: 0
                };
                ordenesCompletadasTemp.forEach(ordenCompletada => {
                    objJornada.gananciasTotales += ordenCompletada.pago;
                    objJornada.quesoTot += ordenCompletada.queso;
                    objJornada.revueltasTot += ordenCompletada.revueltas; 
                    objJornada.chicharronTot += ordenCompletada.chicharron;
                    objJornada.gaseosaTot += ordenCompletada.gaseosa;
                    objJornada.refrescoTot += ordenCompletada.refresco;
                    objJornada.chocolateTot += ordenCompletada.chocolate;
                });
                ordenesCanceladasTemp.forEach(ordenCancelada => objJornada.gananciasPerdidas += ordenCancelada.pago);

                // crear la entrada en el historial de ordenes
                await addDoc(collection(db, 'historialOrdenes'), objJornada);

                mensajesStore.crearMensaje({
                    titulo: 'Añadida al historial', 
                    texto: `Jornada con fecha ${fechaFormateadaCorta(new Date())} completada exitosamente y añadida al historial`, 
                    color: 'success', 
                    id: 'mensajeJornadaCerrada',
                    autoEliminar: true
                });

                
                // se procede a borrar las ordenes en la db
                ordenesStore.ordenes.forEach(async orden => {
                    await deleteDoc(doc(db, "orden", orden.id));
                });

                ordenesStore.$reset(); // se resetea la store de las ordenes
            } catch (error) {
                mensajesStore.crearError('noTerminoJornada', 'No se pudo terminar la jornada');
                console.log(error);
            }
        }
    }
});
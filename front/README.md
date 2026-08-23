# Event Companion Pro

Actúa como un Product Designer Senior, UX Architect y Frontend Engineer especializado en plataformas SaaS, CRM, automatización con inteligencia artificial y gestión de eventos.

Quiero que generes únicamente un PROTOTIPO FRONTEND moderno y funcional.

NO necesito backend real, APIs reales, conexión real con WhatsApp, procesamiento real de Excel, autenticación real ni inteligencia artificial real.

Todo debe funcionar con datos mock, estados locales y simulaciones visuales para efectos de demostración.

━━━━━━━━━━━━━━━━━━━

OBJETIVO DEL SISTEMA

━━━━━━━━━━━━━━━━━━━

Crear una plataforma SaaS para Wedding Planners que permita automatizar y administrar la confirmación de invitados de múltiples eventos mediante conversaciones simuladas de WhatsApp asistidas por inteligencia artificial.

El sistema debe permitir que un Wedding Planner pueda:

- Crear múltiples eventos

- Mantener completamente separada la información de cada evento

- Subir una plantilla de Excel con invitados

- Procesar visualmente la información del Excel

- Identificar al representante de cada invitación

- Saber cuántas personas incluye cada invitación

- Configurar mensajes personalizados

- Simular el envío de WhatsApp

- Visualizar las respuestas

- Dar seguimiento automático

- Confirmar cuántos invitados asistirán

- Identificar quién no ha respondido

- Identificar quién rechazó

- Consultar métricas generales del evento

La plataforma debe sentirse como:

“Un asistente inteligente de confirmación de invitados para Wedding Planners”.

━━━━━━━━━━━━━━━━━━━

IMPORTANTE

━━━━━━━━━━━━━━━━━━━

Este proyecto es solamente un MVP / prototipo frontend.

NO implementar:

- Backend

- Base de datos real

- WhatsApp API

- Meta API

- Inteligencia artificial real

- Login real

- Procesamiento real de Excel

- Notificaciones reales

- WebSockets

- Automatizaciones reales

- Pagos

Todo debe ser mock/demo.

Sin embargo, el prototipo debe simular de forma convincente cómo funcionaría el producto final.

━━━━━━━━━━━━━━━━━━━

CONCEPTO PRINCIPAL

━━━━━━━━━━━━━━━━━━━

La plataforma trabaja alrededor de EVENTOS.

Cada Wedding Planner puede tener múltiples eventos simultáneamente.

Ejemplos:

- Boda Andrea & Carlos

- Boda Mariana & Diego

- XV Años Sofía

- Boda Fernanda & Luis

IMPORTANTE:

Cada evento debe funcionar como un espacio independiente.

Los invitados, conversaciones, configuraciones, estadísticas y mensajes de un evento NO deben mezclarse con otro.

━━━━━━━━━━━━━━━━━━━

LOGIN

━━━━━━━━━━━━━━━━━━━

Crear una pantalla de acceso elegante.

Campos:

- Correo

- Contraseña

- Recordarme

- Recuperar contraseña

Botón:

“Iniciar sesión”

Agregar una experiencia mock donde el usuario pueda ingresar a la plataforma.

La información de los eventos solamente debe visualizarse después de iniciar sesión.

━━━━━━━━━━━━━━━━━━━

DASHBOARD PRINCIPAL

━━━━━━━━━━━━━━━━━━━

Después del login mostrar un dashboard con todos los eventos del Wedding Planner.

Mostrar:

- Eventos activos

- Próximos eventos

- Total de invitados

- Confirmaciones pendientes

- Invitados confirmados

- Invitados que rechazaron

- Conversaciones pendientes

- Actividad reciente

Agregar botón principal:

“Crear nuevo evento”

━━━━━━━━━━━━━━━━━━━

CREAR EVENTO

━━━━━━━━━━━━━━━━━━━

Crear un wizard sencillo.

Paso 1:

Información del evento

- Nombre del evento

- Tipo de evento

- Nombre de los anfitriones

- Fecha

- Hora

- Lugar

- Dirección

- Número estimado de invitados

Paso 2:

Configuración visual

- Imagen portada

- Colores

- Nombre corto

Paso 3:

Lista de invitados

- Subir Excel

- Cargar después

━━━━━━━━━━━━━━━━━━━

DETALLE DEL EVENTO

━━━━━━━━━━━━━━━━━━━

Al entrar a un evento mostrar un dashboard exclusivo de ese evento.

Header:

Boda Andrea & Carlos

15 de noviembre de 2026

KPIs:

- Invitaciones registradas

- Personas invitadas

- Personas confirmadas

- Pendientes

- No asistirán

- Sin respuesta

- Conversaciones activas

Agregar progreso general:

“74% de invitados ya confirmaron”

━━━━━━━━━━━━━━━━━━━

NAVEGACIÓN DEL EVENTO

━━━━━━━━━━━━━━━━━━━

Dentro de cada evento mostrar:

- Resumen

- Invitados

- Conversaciones

- Automatización IA

- Mensajes

- Importar Excel

- Estadísticas

- Configuración

━━━━━━━━━━━━━━━━━━━

IMPORTACIÓN DE EXCEL

━━━━━━━━━━━━━━━━━━━

Este módulo es fundamental.

Crear una experiencia Drag & Drop.

Texto:

“Sube tu lista de invitados”

Aceptar visualmente archivos:

.xlsx

.xls

.csv

Después de subir el archivo mostrar:

“Procesando archivo…”

y posteriormente una previsualización.

━━━━━━━━━━━━━━━━━━━

MAPEO DE COLUMNAS

━━━━━━━━━━━━━━━━━━━

Después de cargar el Excel permitir mapear columnas.

Ejemplo:

Columna Excel:

NOMBRE

Asignar como:

Nombre del representante

Columna:

TELÉFONO

Asignar como:

Número de WhatsApp

Columna:

INVITADOS

Asignar como:

Número de personas invitadas

Columna:

MESA

Asignar como:

Mesa asignada

Agregar campos opcionales:

- Nombre

- Apellido

- Teléfono

- Número de invitados

- Mesa

- Familia

- Tipo de invitado

- Notas

- Etiqueta

Mostrar botón:

“Importar invitados”

━━━━━━━━━━━━━━━━━━━

TABLA DE INVITADOS

━━━━━━━━━━━━━━━━━━━

Crear una tabla CRM moderna.

Cada fila debe representar una invitación.

Columnas:

- Representante

- Teléfono

- Invitados asignados

- Confirmados

- Estado WhatsApp

- Último mensaje

- Última respuesta

- Estado confirmación

- Fecha de seguimiento

- Acciones

━━━━━━━━━━━━━━━━━━━

ESTADOS DE CONFIRMACIÓN

━━━━━━━━━━━━━━━━━━━

Usar badges visuales:

Sin contactar

Mensaje enviado

Entregado

Respondió

En conversación

Confirmado

Confirmación parcial

No asistirá

Sin respuesta

Requiere seguimiento

━━━━━━━━━━━━━━━━━━━

EJEMPLO DE REGISTRO

━━━━━━━━━━━━━━━━━━━

Representante:

María González

Teléfono:

+52 999 123 4567

Invitados asignados:

4

Confirmados:

3

Estado:

Confirmación parcial

Última respuesta:

“Sí vamos, solamente seremos tres personas.”

━━━━━━━━━━━━━━━━━━━

CONVERSACIONES WHATSAPP

━━━━━━━━━━━━━━━━━━━

Crear una interfaz estilo:

WhatsApp Business

Intercom

HubSpot Inbox

Panel izquierdo:

Lista de conversaciones.

Mostrar:

- Nombre

- Teléfono

- Evento

- Último mensaje

- Hora

- Estado

- Badge de pendiente

Panel central:

Conversación completa.

Mostrar bubbles simulando WhatsApp.

Panel derecho:

Información del invitado.

Mostrar:

- Nombre

- Teléfono

- Invitados asignados

- Confirmados

- Mesa

- Estado

- Notas

━━━━━━━━━━━━━━━━━━━

INTERVENCIÓN HUMANA

━━━━━━━━━━━━━━━━━━━

El Wedding Planner debe poder intervenir manualmente.

Agregar botones:

“Pausar IA”

“Responder personalmente”

“Reactivar automatización”

Cuando la IA esté pausada mostrar:

“Conversación tomada por un miembro del equipo.”

━━━━━━━━━━━━━━━━━━━

ASISTENTE CON IA

━━━━━━━━━━━━━━━━━━━

Crear un módulo llamado:

“Asistente de Confirmaciones”

El objetivo es configurar cómo debe comunicarse la IA.

IMPORTANTE:

El usuario debe sentir que puede controlar la personalidad del asistente.

━━━━━━━━━━━━━━━━━━━

PERSONALIDAD DEL ASISTENTE

━━━━━━━━━━━━━━━━━━━

Permitir configurar:

Nombre del asistente

Ejemplo:

“Sofía”

Tono:

- Elegante

- Casual

- Amable

- Cercano

- Formal

- Divertido

Nivel de formalidad:

Slider.

Uso de emojis:

- Ninguno

- Algunos

- Frecuentes

Longitud mensajes:

- Cortos

- Normales

- Detallados

━━━━━━━━━━━━━━━━━━━

MENSAJE INICIAL

━━━━━━━━━━━━━━━━━━━

Agregar un editor grande.

Pregunta:

“¿Cómo quieres que iniciemos la conversación con tus invitados?”

Ejemplo:

“Hola {{nombre}} 👋

Soy Sofía, asistente del equipo de Andrea & Carlos.

Estamos confirmando los invitados para su boda del próximo 15 de noviembre.

Tenemos registrada una invitación para {{numero_invitados}} personas.

¿Nos podrías confirmar si podrán acompañarnos?”

━━━━━━━━━━━━━━━━━━━

VARIABLES DINÁMICAS

━━━━━━━━━━━━━━━━━━━

Permitir insertar variables:

{{nombre}}

{{numero_invitados}}

{{evento}}

{{fecha}}

{{lugar}}

{{hora}}

{{planner}}

━━━━━━━━━━━━━━━━━━━

PERSONALIZACIÓN AUTOMÁTICA

━━━━━━━━━━━━━━━━━━━

Simular que la IA adapta ligeramente cada mensaje.

Ejemplo:

Familia González:

“Hola María, ¿cómo estás? 😊”

Juan Pérez:

“Hola Juan, esperamos que estés teniendo un excelente día.”

Los mensajes NO deben parecer exactamente iguales.

La plataforma debe transmitir que cada conversación se siente natural y humana.

━━━━━━━━━━━━━━━━━━━

REGLAS DE CONVERSACIÓN

━━━━━━━━━━━━━━━━━━━

Permitir configurar instrucciones.

Ejemplos:

- Nunca mencionar que eres una IA.

- Siempre ser amable.

- Nunca presionar al invitado.

- Preguntar cuántas personas asistirán.

- No superar el número máximo de invitados.

- Confirmar nuevamente el número final.

- Si existe una situación especial, escalar al Wedding Planner.

━━━━━━━━━━━━━━━━━━━

FLUJO DE CONFIRMACIÓN

━━━━━━━━━━━━━━━━━━━

Simular este flujo:

1. Mensaje inicial enviado.

2. Invitado responde.

3. IA interpreta respuesta.

4. IA identifica número de asistentes.

5. IA confirma:

“Perfecto María, entonces confirmamos 3 asistentes.”

6. Estado cambia automáticamente a:

CONFIRMADO

━━━━━━━━━━━━━━━━━━━

RESPUESTAS AMBIGUAS

━━━━━━━━━━━━━━━━━━━

Simular casos como:

“Todavía no sabemos.”

Entonces:

Estado:

PENDIENTE

Y programar seguimiento.

━━━━━━━━━━━━━━━━━━━

SEGUIMIENTOS AUTOMÁTICOS

━━━━━━━━━━━━━━━━━━━

Crear módulo:

“Reglas de seguimiento”

Ejemplo:

Primer contacto:

30 días antes.

Primer recordatorio:

7 días después.

Segundo recordatorio:

14 días después.

Último intento:

7 días antes del evento.

Todo mock.

━━━━━━━━━━━━━━━━━━━

CENTRO DE MENSAJES

━━━━━━━━━━━━━━━━━━━

Crear biblioteca de mensajes.

Categorías:

- Primer contacto

- Recordatorio

- Confirmación

- Rechazo

- Información del evento

- Ubicación

- Dress code

- Agradecimiento

━━━━━━━━━━━━━━━━━━━

RESPUESTAS FRECUENTES

━━━━━━━━━━━━━━━━━━━

Permitir agregar preguntas y respuestas.

Ejemplos:

Pregunta:

“¿Dónde es la boda?”

Respuesta:

“Hacienda San José, Mérida.”

Pregunta:

“¿Pueden ir niños?”

Respuesta:

“El evento está planeado únicamente para adultos.”

Pregunta:

“¿Cuál es el código de vestimenta?”

Respuesta:

“Formal.”

━━━━━━━━━━━━━━━━━━━

ESTADÍSTICAS

━━━━━━━━━━━━━━━━━━━

Dashboard por evento.

Mostrar:

Invitados totales

Confirmados

No asistirán

Pendientes

Sin respuesta

Conversaciones activas

Tasa de respuesta

Promedio de tiempo de respuesta

━━━━━━━━━━━━━━━━━━━

GRÁFICAS

━━━━━━━━━━━━━━━━━━━

Agregar:

Donut:

Confirmados vs pendientes.

Bar chart:

Confirmaciones por día.

Timeline:

Actividad de mensajes.

Progress:

Porcentaje general de confirmación.

━━━━━━━━━━━━━━━━━━━

RESUMEN FINAL

━━━━━━━━━━━━━━━━━━━

Crear una pantalla:

“Lista final de invitados”

Mostrar:

Total invitados originalmente:

250

Confirmados:

213

No asistirán:

24

Pendientes:

13

━━━━━━━━━━━━━━━━━━━

EXPORTAR

━━━━━━━━━━━━━━━━━━━

Agregar botones mock:

Exportar Excel

Exportar CSV

Descargar lista final

Generar reporte

━━━━━━━━━━━━━━━━━━━

MULTI-EVENTO

━━━━━━━━━━━━━━━━━━━

Este punto es MUY IMPORTANTE.

El Wedding Planner puede manejar múltiples eventos simultáneamente.

Cada evento debe mantener completamente separados:

- Invitados

- Conversaciones

- Mensajes

- Plantillas

- Personalidad IA

- Estadísticas

- Configuración

- Seguimientos

━━━━━━━━━━━━━━━━━━━

ROLES Y USUARIOS

━━━━━━━━━━━━━━━━━━━

Preparar visualmente el sistema para:

Administrador

Wedding Planner

Coordinador

Asistente

Permitir configurar permisos mock.

━━━━━━━━━━━━━━━━━━━

ESTILO VISUAL

━━━━━━━━━━━━━━━━━━━

Crear una experiencia:

- premium

- elegante

- romántica

- tecnológica

- minimalista

- profesional

NO hacer una interfaz excesivamente rosa.

Debe funcionar para diferentes tipos de eventos y Wedding Planners.

Paleta sugerida:

Background:

#FAFAF9

Surface:

#FFFFFF

Primary:

#35312E

Accent:

#C6A47E

Soft Rose:

#F4E8E5

Success:

#63846A

Text:

#282523

━━━━━━━━━━━━━━━━━━━

DISEÑO

━━━━━━━━━━━━━━━━━━━

Inspiración:

Linear

Notion

Intercom

WhatsApp Business

Stripe Dashboard

HoneyBook

Pinterest

━━━━━━━━━━━━━━━━━━━

MICROINTERACCIONES

━━━━━━━━━━━━━━━━━━━

Agregar:

- transiciones suaves

- loaders

- procesamiento de Excel

- animación al confirmar invitado

- badges dinámicos

- progress bars

- estados hover

- skeleton loading

━━━━━━━━━━━━━━━━━━━

COMPONENTES

━━━━━━━━━━━━━━━━━━━

Crear componentes reutilizables:

Sidebar

Event Cards

Dashboard Cards

Guest Table

WhatsApp Chat

Chat Bubble

Guest Profile

Excel Upload

Column Mapper

AI Configuration

Message Editor

Template Cards

Status Badges

Charts

Progress Ring

Activity Timeline

━━━━━━━━━━━━━━━━━━━

STACK

━━━━━━━━━━━━━━━━━━━

Usar:

React

TypeScript

TailwindCSS

Shadcn/UI

Arquitectura escalable.

Componentes reutilizables.

━━━━━━━━━━━━━━━━━━━

MOCK DATA

━━━━━━━━━━━━━━━━━━━

Crear al menos:

4 eventos

80 invitados

20 conversaciones

Diferentes estados

Mensajes simulados

Confirmaciones completas

Confirmaciones parciales

Personas que rechazaron

Personas sin respuesta

━━━━━━━━━━━━━━━━━━━

OBJETIVO FINAL

━━━━━━━━━━━━━━━━━━━

El prototipo debe demostrar claramente este flujo:

CREAR EVENTO

↓

SUBIR EXCEL

↓

MAPEAR INFORMACIÓN

↓

CONFIGURAR ASISTENTE

↓

PERSONALIZAR MENSAJE

↓

INICIAR CONFIRMACIONES

↓

VISUALIZAR CONVERSACIONES

↓

IA INTERPRETA RESPUESTAS

↓

ACTUALIZAR INVITADOS CONFIRMADOS

↓

DAR SEGUIMIENTO

↓

GENERAR LISTA FINAL

La plataforma debe sentirse como:

“El copiloto inteligente de un Wedding Planner para confirmar invitados.”

No debe parecer solamente un bot de WhatsApp.

Debe sentirse como un CRM completo de gestión de confirmaciones para eventos.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://alanna-conf.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/87bf3e58-fc99-4124-9984-2074e96ad4b6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

# Plan de Implementación: Modo "Solo Menú Digital"

Este plan detalla los pasos necesarios para habilitar una versión simplificada del sistema para clientes que **solo quieren el menú digital y administrar pedidos** (ideal para atención por WhatsApp), manteniendo intacto el sistema completo (POS, Kiosko, etc.) para los clientes actuales.

## Fase 1: Base de Datos
Para controlar qué módulos tiene activos cada cliente, necesitamos una bandera (flag) en la base de datos.
Ya que la configuración del negocio se lee en todos los módulos a través de la tabla `settings`, es el lugar ideal para agregar este control.

1. **Script SQL (Supabase):**
   Crearemos un script (`add_system_mode.sql`) para agregar una columna `system_mode` a la tabla `settings`.
   ```sql
   ALTER TABLE settings ADD COLUMN IF NOT EXISTS system_mode TEXT DEFAULT 'full';
   ```
   *Valores posibles: `'full'` (Sistema Completo actual) y `'menu_only'` (Solo Menú Digital).*

## Fase 2: Panel de SuperAdmin (Gestión)
Para que tú puedas vender y asignar estos planes fácilmente:
1. **Modificar `superadmin.html` y `js/superadmin.js`**:
   - En la tabla de gestión de clientes/negocios, agregar un selector desplegable o interruptor (Toggle) llamado **"Tipo de Plan"**.
   - Opciones: `Plan Completo (POS+Kiosko)` vs `Plan Básico (Solo Menú)`.
   - Al guardar, esta configuración se actualizará en la tabla `settings` del negocio correspondiente.

## Fase 3: Restricción en el Panel de Administración (`admin.html`)
Cuando un cliente con plan "Solo Menú" entre a su panel de administración, el sistema debe adaptarse visualmente.

1. **Lógica en `js/admin-v2.js`**:
   - Al cargar la información del negocio (`settings.system_mode`), verificamos si es `'menu_only'`.
2. **Ocultar Módulos Innecesarios**:
   - Ocultar botones de navegación (Sidebar y Bottom Nav) para:
     - **POS**
     - **Kiosko**
     - **Cortes de Caja** (Z-Report)
     - **Gastos y Movimientos**
     - **Personal / Roles** (Opcional, para simplificar).
3. **Módulos que quedan activos**:
   - **Dashboard / Pedidos**: Para ver y gestionar los pedidos entrantes (WhatsApp/Online).
   - **Menú**: Para crear categorías, productos y extras.
   - **Configuración**: Para ajustes básicos (Logo, WhatsApp, colores).

## Fase 4: Bloqueo de Seguridad en POS y Kiosko
Si un cliente "Solo Menú" intenta ingresar directamente a las URL del POS o Kiosko (ej. copiando y pegando el link), debemos bloquear el acceso.

1. **Lógica en `js/pos-v2.js` y `js/kiosk.js`**:
   - En la función de inicialización `initApp()`, luego de cargar los `settings`, validar `system_mode`.
   - Si es `'menu_only'`, mostrar un modal o alerta de acceso denegado: *"Este módulo no está incluido en su plan actual."*
   - Redirigir automáticamente a `admin.html`.

## Fase 5: Ajustes Específicos para WhatsApp (Opcional)
- Confirmar que el flujo del carrito en línea en `index.html` (el menú del cliente) siga generando el mensaje de WhatsApp correctamente.
- En el panel de pedidos del Admin (`order-status.html`), asegurar que el cliente pueda cambiar los estados de los pedidos fácilmente sin depender de impresoras térmicas ni cajas registradoras.

## ¿Qué sigue?
Si estás de acuerdo con este enfoque, **podemos empezar paso a paso**. 
¿Te gustaría que ejecutemos primero el paso de la Base de Datos (Fase 1) y luego adaptemos el panel de SuperAdmin (Fase 2)?

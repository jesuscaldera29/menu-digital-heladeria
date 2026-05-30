# 🌐 Configuración de Dominio Propio / Personalizado

Esta guía explica cómo configurar un dominio propio para tu menú digital (ej: `menu.miheladeria.com` o `miheladeria.com`) en lugar de usar la URL con el slug (ej: `menudigital.com/miheladeria`).

---

## 🛠️ Requisitos
1. Acceso al panel de administración de tu proveedor de dominio (GoDaddy, Namecheap, Cloudflare, etc.).
2. Tu plataforma del Menú Digital desplegada en un hosting que soporte multi-inquilino o dominios personalizados (como **Vercel**, **Netlify**, o un servidor **VPS** propio).

---

## 📋 Pasos para la Configuración

### Paso 1: Configurar los Registros DNS
Debes apuntar tu dominio o subdominio hacia los servidores de tu hosting. Ve al panel de control de tu proveedor de dominios y añade los siguientes registros en la sección **DNS**:

#### Opción A: Usar un Subdominio (Recomendado)
Ejemplo: `menu.miheladeria.com`
* **Tipo**: `CNAME`
* **Nombre / Host**: `menu`
* **Valor / Destino**: `cname.vercel-dns.com` (o el CNAME provisto por tu plataforma de hosting)
* **TTL**: Automático o 1 Hora

#### Opción B: Usar el Dominio Principal (Root Domain)
Ejemplo: `miheladeria.com`
* **Tipo**: `A`
* **Nombre / Host**: `@`
* **Valor / Destino**: `76.76.21.21` (IP de Vercel) o la IP de tu servidor VPS
* **TTL**: Automático o 1 Hora

---

### Paso 2: Vincular el Dominio en el Hosting (Ej: Vercel)
1. Ve al panel de tu proyecto en Vercel.
2. Ingresa a **Settings** ➔ **Domains**.
3. Haz clic en **Add**.
4. Escribe tu dominio completo (ej: `menu.miheladeria.com`) y confirma.
5. Vercel generará e instalará automáticamente el certificado de seguridad SSL (**HTTPS**) una vez que las DNS se hayan propagado.

---

### Paso 3: Configurar la Base de Datos (Supabase)
Para que el sistema sepa qué negocio cargar cuando un cliente entra desde un dominio personalizado, debes guardar el dominio en la configuración del negocio.

1. Hemos preparado la base de datos para registrar el dominio en la tabla de configuraciones.
2. En el panel administrativo de Supabase, puedes asociar el dominio con la columna `menu_url` de la tabla `settings` para ese `business_id` (ej: `https://menu.miheladeria.com`).

---

### Paso 4: Resolución Automática en el Frontend
El código de la aplicación resolverá automáticamente el negocio basándose en el dominio desde el cual se accede:

```javascript
// El sistema verifica el dominio en el que se ejecuta
const currentHost = window.location.hostname; // ej: menu.miheladeria.com

// Si no es el dominio principal del sistema (ej: menudigital.com),
// busca en la base de datos el negocio que tiene configurado ese 'menu_url'
```

*Nota: Esta lógica permite que los clientes ingresen directamente sin ver el slug en la barra de direcciones, brindando una experiencia 100% profesional y de marca blanca.*

---

## ⏳ Tiempo de Activación
Los cambios en los registros DNS pueden tardar entre **1 y 24 horas** en propagarse globalmente, aunque usualmente se activan en menos de **30 minutos**. Una vez listos, tu menú digital estará en línea bajo tu propia marca. 🚀

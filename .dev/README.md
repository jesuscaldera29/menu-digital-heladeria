# 🔧 Entorno de Desarrollo (.dev)

## ⚠️ REGLA IMPORTANTE
> Todos los cambios, fixes y features se trabajan **AQUÍ** primero.
> **NUNCA** modificar `.main/` directamente.

## Flujo de Trabajo

1. Hacer cambios en los archivos dentro de `.dev/`
2. Probar en el navegador (abrir los HTML localmente o con Live Server)
3. Cuando el fix está validado, copiar los archivos modificados a `.main/`
4. Desde `.main/` hacer push a GitHub → Vercel despliega automáticamente

## Archivos Clave
| Archivo | Descripción |
|---------|-------------|
| `admin.html` | Panel de administración principal |
| `pos.html` | Punto de venta |
| `kiosk.html` | Modo kiosko para autoatención |
| `js/admin-staff.js` | Gestión de empleados |
| `js/admin-branches.js` | Gestión de sucursales |
| `js/admin-v2.js` | Lógica principal del admin |
| `js/pos-v2.js` | Lógica principal del POS |
| `js/kiosk.js` | Lógica del kiosko |
| `js/admin-expenses.js` | Módulo de gastos |
| `js/admin-features.js` | Cupones, créditos, recetas, importar |

## Scripts SQL
Los archivos `.sql` son para documentación de migraciones.
Se ejecutan manualmente en el **Supabase SQL Editor**.

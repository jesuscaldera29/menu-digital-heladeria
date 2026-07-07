# 🚀 Entorno de Producción (.main)

## ⚠️ REGLA IMPORTANTE
> Esta carpeta contiene **SOLO** código probado y validado.
> **NO** modificar directamente. Todo cambio viene de `.dev/`.

## Flujo de Despliegue

1. Validar que los cambios funcionan correctamente en `.dev/`
2. Copiar los archivos modificados de `.dev/` a `.main/`
3. Hacer push a GitHub desde la raíz del proyecto
4. Vercel detecta los cambios y despliega automáticamente

## Comando para sincronizar desde .dev

```powershell
# Copiar archivos modificados (ejemplo individual)
Copy-Item ".dev\js\admin-staff.js" ".main\js\admin-staff.js"

# Copiar todo (sincronizar completo)
robocopy ".dev" ".main" /E /NFL /NDL
```

## Versionado
Cada push a producción debe tener un commit descriptivo:
```
fix: #1 agregar edición de usuarios
fix: #2 resolver error cajero ya existe
feat: #10 monto recibido en pago efectivo
```

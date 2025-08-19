#!/bin/bash

echo "🧹 Limpiando archivos XML de caracteres inválidos..."

# Función para limpiar XML
clean_xml() {
    local input_file="$1"
    local output_file="${input_file%.xml}_clean.xml"
    
    echo "Procesando: $input_file"
    
    # Método 1: iconv para conversión de encoding
    if iconv -f utf-8 -t utf-8 -c "$input_file" > "$output_file" 2>/dev/null; then
        echo "✅ Limpieza exitosa con iconv"
    else
        # Método 2: sed para remover caracteres problemáticos
        sed 's/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]//g' "$input_file" > "$output_file"
        echo "✅ Limpieza exitosa con sed"
    fi
    
    # Verificar si el archivo resultante es válido
    if xmllint --noout "$output_file" 2>/dev/null; then
        mv "$output_file" "$input_file"
        echo "✅ $input_file limpiado y validado"
    else
        echo "⚠️ $input_file aún tiene problemas, manteniendo original"
        rm -f "$output_file"
    fi
}

# Limpiar archivos
if [ -f "data/consolidated.xml" ]; then
    clean_xml "data/consolidated.xml"
fi

if [ -f "data/eu_sanctions.xml" ]; then
    clean_xml "data/eu_sanctions.xml"
fi

echo "🎉 Proceso de limpieza completado"

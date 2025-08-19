#!/bin/bash

echo "🧹 Limpiando archivos XML de caracteres inválidos (v2)..."

clean_xml() {
    local input_file="$1"
    local temp_file="${input_file}.temp"
    
    echo "📄 Procesando: $input_file"
    
    # Método usando tr para remover caracteres problemáticos
    if tr -d '\000-\010\013\014\016-\037\177-\237' < "$input_file" > "$temp_file" 2>/dev/null; then
        echo "✅ Limpieza con tr exitosa"
        
        # Verificar si el archivo resultante es XML válido
        if xmllint --noout "$temp_file" 2>/dev/null; then
            mv "$temp_file" "$input_file"
            echo "✅ $input_file limpiado y validado"
            return 0
        else
            echo "⚠️ $input_file aún tiene problemas XML después de tr"
            rm -f "$temp_file"
        fi
    fi
    
    # Método alternativo usando awk
    echo "🔄 Intentando limpieza con awk..."
    awk '{gsub(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/, ""); print}' "$input_file" > "$temp_file" 2>/dev/null
    
    if xmllint --noout "$temp_file" 2>/dev/null; then
        mv "$temp_file" "$input_file"
        echo "✅ $input_file limpiado con awk"
        return 0
    else
        echo "⚠️ $input_file aún tiene problemas después de awk"
        rm -f "$temp_file"
        return 1
    fi
}

# Procesar archivos
cleaned_count=0
total_count=0

if [ -f "data/consolidated.xml" ]; then
    total_count=$((total_count + 1))
    if clean_xml "data/consolidated.xml"; then
        cleaned_count=$((cleaned_count + 1))
    fi
fi

if [ -f "data/eu_sanctions.xml" ]; then
    total_count=$((total_count + 1))
    if clean_xml "data/eu_sanctions.xml"; then
        cleaned_count=$((cleaned_count + 1))
    fi
fi

echo ""
echo "🎉 Proceso completado: $cleaned_count/$total_count archivos limpiados"

# Si no se pudo limpiar, sugerir usar JavaScript robusto
if [ $cleaned_count -lt $total_count ]; then
    echo ""
    echo "💡 Sugerencia: Si algunos archivos aún tienen problemas,"
    echo "   la aplicación usará parsers robustos en JavaScript"
    echo "   que pueden manejar caracteres inválidos."
fi

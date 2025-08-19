#!/usr/bin/env python3
import re
import sys
import os

def clean_xml_file(filepath):
    """Limpia caracteres inválidos de un archivo XML"""
    print(f"🧹 Procesando: {filepath}")
    
    try:
        # Leer archivo
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        print(f"📄 Tamaño original: {len(content)} caracteres")
        
        # Limpiar caracteres de control inválidos (mantener \t, \n, \r)
        # Remover caracteres de control excepto tab (0x09), newline (0x0A), carriage return (0x0D)
        cleaned = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]', '', content)
        
        # Escapar ampersands no válidos
        cleaned = re.sub(r'&(?![a-zA-Z0-9#]{1,8};)', '&amp;', cleaned)
        
        print(f"🧽 Tamaño después de limpieza: {len(cleaned)} caracteres")
        
        # Crear archivo temporal
        temp_file = filepath + '.temp'
        with open(temp_file, 'w', encoding='utf-8') as f:
            f.write(cleaned)
        
        # Verificar si es XML válido usando xmllint
        result = os.system(f'xmllint --noout "{temp_file}" 2>/dev/null')
        
        if result == 0:
            # XML válido, reemplazar original
            os.replace(temp_file, filepath)
            print(f"✅ {filepath} limpiado exitosamente")
            return True
        else:
            # Aún inválido, mantener original
            os.remove(temp_file)
            print(f"⚠️ {filepath} aún tiene problemas XML")
            return False
            
    except Exception as e:
        print(f"❌ Error procesando {filepath}: {e}")
        return False

def main():
    print("🧹 Iniciando limpieza de archivos XML...")
    
    files_to_clean = []
    if os.path.exists('data/consolidated.xml'):
        files_to_clean.append('data/consolidated.xml')
    if os.path.exists('data/eu_sanctions.xml'):
        files_to_clean.append('data/eu_sanctions.xml')
    
    if not files_to_clean:
        print("⚠️ No se encontraron archivos XML para limpiar")
        return
    
    success_count = 0
    for filepath in files_to_clean:
        if clean_xml_file(filepath):
            success_count += 1
    
    print(f"\n🎉 Proceso completado: {success_count}/{len(files_to_clean)} archivos limpiados exitosamente")

if __name__ == "__main__":
    main()

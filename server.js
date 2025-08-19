const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static('.'));

// Headers para permitir descarga de archivos
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Headers para archivos XML/CSV
  if (req.path.endsWith('.xml')) {
    res.type('application/xml');
  } else if (req.path.endsWith('.csv')) {
    res.type('text/csv');
  }
  
  next();
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Ruta para archivos de datos
app.get('/data/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(__dirname, 'data', filename);
  
  console.log(`📁 Solicitando archivo: ${filename}`);
  res.sendFile(filepath, (err) => {
    if (err) {
      console.error(`❌ Error enviando archivo ${filename}:`, err.message);
      res.status(404).json({ error: 'Archivo no encontrado' });
    } else {
      console.log(`✅ Archivo enviado: ${filename}`);
    }
  });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error('❌ Error del servidor:', err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SAGRILAFT servidor corriendo en puerto ${PORT}`);
  console.log(`🌐 URL local: http://localhost:${PORT}`);
});

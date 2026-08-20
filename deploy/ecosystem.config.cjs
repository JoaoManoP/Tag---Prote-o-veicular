'use strict';
const path=require('node:path');
module.exports={apps:[{name:'rastreon',cwd:path.resolve(__dirname,'..'),script:'server/server.js',instances:1,exec_mode:'fork',autorestart:true,watch:false,max_memory_restart:'450M',env:{NODE_ENV:'production'}}]};

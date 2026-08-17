'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
require('dotenv').config();

function safeTimestamp(now=new Date()){return now.toISOString().replace(/[:.]/g,'-')}
function backupDatabase({databasePath=process.env.DATABASE_PATH||path.join(__dirname,'..','data','rastreon.sqlite'),backupDirectory=process.env.BACKUP_DIRECTORY||path.join(__dirname,'..','backups'),now=new Date()}={}){
  const source=path.resolve(databasePath),directory=path.resolve(backupDirectory);
  if(databasePath===':memory:')throw new Error('Banco em memória não pode ser copiado.');
  if(!fs.existsSync(source))throw new Error(`Banco não encontrado: ${source}`);
  fs.mkdirSync(directory,{recursive:true});
  const destination=path.join(directory,`rastreon-${safeTimestamp(now)}.sqlite`),database=new DatabaseSync(source);
  try{database.exec(`VACUUM INTO '${destination.replace(/'/g,"''")}'`)}finally{database.close()}
  const verify=new DatabaseSync(destination,{readOnly:true});
  try{const integrity=verify.prepare('PRAGMA integrity_check').get();if(integrity.integrity_check!=='ok')throw new Error('A cópia falhou na verificação de integridade.');verify.prepare('SELECT 1').get()}finally{verify.close()}
  return destination;
}

if(require.main===module){try{const destination=backupDatabase();console.log(`Backup verificado: ${destination}`)}catch(error){console.error(error.message);process.exitCode=1}}

module.exports={backupDatabase,safeTimestamp};

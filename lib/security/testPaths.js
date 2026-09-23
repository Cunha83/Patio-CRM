'use strict';
const fs=require('fs'),path=require('path'),os=require('os');
function canonical(value){let current=path.resolve(value),suffix=[];while(!fs.existsSync(current)){const parent=path.dirname(current);if(parent===current)break;suffix.unshift(path.basename(current));current=parent;}return path.resolve(fs.realpathSync(current),...suffix);}
function assertTestResourcePath(value,label='recurso'){
 const resolved=path.resolve(value);
 if(process.env.NODE_ENV==='test'||process.env.NODE_TEST_CONTEXT){
   const base=canonical(os.tmpdir()),target=canonical(resolved),relative=path.relative(base,target);
   if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('[TEST_PATH_GUARD] '+label+' de teste deve permanecer em diretório temporário isolado.');
 }
 return resolved;
}
module.exports={assertTestResourcePath,canonical};

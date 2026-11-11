'use strict';
window.TDNCodeAssistCore=(()=>{
  const indices=new WeakMap();
  function prepare(data){if(data.definitions){const records={};for(const [name,index] of Object.entries(data.callables))records[name]={...data.definitions[index],name};data.callables=records;delete data.definitions;}
    // Class method tables also live in modules; only real module paths form import parents.
    const paths=new Set(Object.keys(data.modules).filter(name=>!data.callables[name]));
    for(const entries of Object.values(data.modules))for(const entry of entries)if(entry.kind==='module')paths.add(entry.qualified);
    for(const path of paths){const parts=path.split('.');for(let i=1;i<parts.length;i++){
      const parent=parts.slice(0,i).join('.'),name=parts[i],qualified=parts.slice(0,i+1).join('.');
      const entries=data.modules[parent]??=[];if(!entries.some(entry=>entry.name===name))entries.push({name,qualified,kind:'module'});
    }}return data;
  }
  function importSuggestions(prefix,cursor,data){
    const line=prefix.slice(prefix.lastIndexOf('\n')+1);
    const symbols=/^\s*from\s+([A-Za-z_]\w*(?:\.\w+)*)\s+import\s+(?:\(\s*)?((?:\w+(?:\s+as\s+\w+)?\s*,\s*)*)([A-Za-z_]\w*)?$/.exec(line);
    let entries,word;
    if(symbols){
      const used=new Set(symbols[2].split(',').map(item=>item.trim().split(/\s+/)[0]));
      entries=(data.modules[symbols[1]]||[]).filter(entry=>!used.has(entry.name));word=symbols[3]||'';
    }else{
      const path=/^\s*from\s+([A-Za-z_]\w*(?:\.\w*)*)?$/.exec(line)||/^\s*import\s+(?:[A-Za-z_]\w*(?:\.\w+)*(?:\s+as\s+\w+)?\s*,\s*)*([A-Za-z_]\w*(?:\.\w*)*)?$/.exec(line);
      if(!path)return /^\s*(?:from|import)\s/.test(line)?{items:[],signature:null,cursor}:null;
      const typed=path[1]||'',dot=typed.lastIndexOf('.');word=typed.slice(dot+1);
      entries=dot>=0?(data.modules[typed.slice(0,dot)]||[]).filter(entry=>entry.kind==='module'):
        [...new Set(Object.keys(data.modules).map(name=>name.split('.')[0]))].map(name=>({name,qualified:name,kind:'module'}));
    }
    return {items:entries.filter(entry=>entry.name.toLowerCase().startsWith(word.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,12).map(entry=>({label:entry.name,insert:entry.name,kind:entry.kind,detail:data.callables[entry.qualified]?.signature||entry.qualified,from:cursor-word.length,to:cursor})),signature:null,cursor};
  }
  function lookup(data,name){let index=indices.get(data);if(!index){index=new Map(Object.keys(data.callables).map(key=>[key.toLowerCase(),key]));indices.set(data,index);}return data.callables[index.get(name.toLowerCase())];}
  function aliases(context,data){const result={nn:'torch.nn',torch:'torch',np:'numpy',pd:'pandas',optim:'torch.optim',F:'torch.nn.functional'};let match;
    const imports=/^\s*import\s+([A-Za-z_]\w*(?:\.\w+)*)(?:\s+as\s+(\w+))?/gm;
    while((match=imports.exec(context)))result[match[2]||match[1].split('.')[0]]=match[2]?match[1]:match[1].split('.')[0];
    const from=/^\s*from\s+([A-Za-z_]\w*(?:\.\w+)*)\s+import\s+([^\n#]+)/gm;
    while((match=from.exec(context)))for(const item of match[2].split(',')){const symbol=/^\s*(\w+)(?:\s+as\s+(\w+))?/.exec(item);if(symbol)result[symbol[2]||symbol[1]]=match[1]+'.'+symbol[1];}
    const assignments=/\b([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*(?:\.\w+)*)\s*\(/g;
    while((match=assignments.exec(context))){const resolved=resolve(match[2],result);if(data.modules[resolved])result[match[1]]=resolved;}
    return result;
  }
  function resolve(name,map){const parts=name.split('.');return (map[parts[0]]||parts[0])+(parts.length>1?'.'+parts.slice(1).join('.'):'');}
  function scan(source,cursor){const text=source.slice(0,cursor),mask=text.split(''),stack=[];let quote='',triple=false,comment=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(comment){if(c==='\n')comment=false;else mask[i]=' ';continue;}
      if(quote){mask[i]=c==='\n'?'\n':' ';if(c==='\\'){if(i+1<text.length)mask[++i]=' ';continue;}if(triple&&text.slice(i,i+3)===quote.repeat(3)){mask[i]=mask[i+1]=mask[i+2]=' ';i+=2;quote='';triple=false;}else if(!triple&&c===quote)quote='';continue;}
      if(c==='#'){comment=true;mask[i]=' ';continue;}if(c==='"'||c==="'"){quote=c;triple=text.slice(i,i+3)===c.repeat(3);mask[i]=' ';if(triple){mask[i+1]=mask[i+2]=' ';i+=2;}continue;}
      if('([{'.includes(c))stack.push({char:c,index:i});else if(')]}'.includes(c)){const pair={')':'(',']':'[','}':'{'}[c];if(stack.at(-1)?.char===pair)stack.pop();}
    }return {masked:mask.join(''),stack,blocked:Boolean(quote||comment)};
  }
  function analyze(source,cursor,data,context=source){
    let current=scan(source,cursor);if(current.blocked)return {items:[],signature:null};
    const imports=importSuggestions(current.masked,cursor,data);if(imports)return imports;
    // Also support typing the complete empty pair, then accepting a parameter before ')'.
    if(/\(\s*\)$/.test(current.masked)){cursor=current.masked.length-1;current=scan(source,cursor);}
    const map=aliases(context,data),prefix=current.masked;
    let signature=null,items=[],replaceStart=cursor,replaceEnd=cursor;
    for(let index=current.stack.length-1;index>=0;index--){const frame=current.stack[index];if(frame.char!=='(')continue;const callee=/([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*$/.exec(prefix.slice(0,frame.index));if(!callee)continue;
      const typed=callee[1],qualified=resolve(typed,map),info=lookup(data,qualified);if(!info)continue;
      const args=prefix.slice(frame.index+1),parts=[];let depth=0,last=0;for(let i=0;i<args.length;i++){if('([{'.includes(args[i]))depth++;else if(')]}'.includes(args[i]))depth--;else if(args[i]===','&&depth===0){parts.push(args.slice(last,i));last=i+1;}}
      const segment=args.slice(last),used=new Set();let position=0;for(const part of parts){const named=/^\s*(\w+)\s*=(?!=)/.exec(part);if(named)used.add(named[1]);else if(part.trim()&&!part.trim().startsWith('*'))position++;}
      const named=/^\s*(\w+)\s*=(?!=)/.exec(segment);const active=named?named[1]:info.params[position]?.name;
      signature={name:typed,canonical:info.name,params:info.params,active,doc:info.doc,caseMismatch:qualified!==info.name};
      if(/^\s*[A-Za-z_\d]*$/.test(segment)){
        const word=(/[A-Za-z_]\w*$/.exec(segment)||[''])[0];replaceStart=cursor-word.length;
        items=info.params.filter((parameter,i)=>parameter.keyword&&i>=position&&!used.has(parameter.name)&&parameter.name.toLowerCase().startsWith(word.toLowerCase())).map(parameter=>({label:parameter.name+'=',insert:parameter.name+'=',kind:'parameter',detail:(parameter.type?parameter.type+' · ':'')+(parameter.default===null?'bắt buộc':'mặc định '+parameter.default),from:replaceStart,to:cursor}));
      }
      break;
    }
    const member=/([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)?$/.exec(prefix);
    if(member){const module=resolve(member[1],map),word=member[2]||'';replaceStart=cursor-word.length;
      items=(data.modules[module]||[]).filter(entry=>entry.name.toLowerCase().startsWith(word.toLowerCase())).map(entry=>({label:entry.name,insert:entry.name,kind:entry.kind,detail:data.callables[entry.qualified]?.signature||entry.qualified,from:replaceStart,to:cursor}));
    }
    if(!signature&&!member){const word=/\b([A-Za-z_]\w{1,})$/.exec(prefix);if(word){replaceStart=cursor-word[1].length;items=Object.keys(map).filter(name=>name.toLowerCase().startsWith(word[1].toLowerCase())).map(name=>({label:name,insert:name,kind:'import',detail:map[name],from:replaceStart,to:cursor}));}}
    return {items:items.slice(0,12),signature,cursor};
  }
  return {analyze,scan,aliases,resolve,prepare};
})();

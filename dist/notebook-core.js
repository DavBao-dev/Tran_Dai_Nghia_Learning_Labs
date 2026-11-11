'use strict';
window.TDNCore=(()=>{
  const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const keywords=new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'.split(' '));
  const builtins=new Set('print len range list dict set tuple str int float bool enumerate zip sum min max abs open super self isinstance type input Exception ValueError'.split(' '));
  function highlight(source){
    if(source.length>100000)return escape(source);
    const pattern=/(#[^\n]*|(?:[rubfRUBF]{0,2})(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)\b|\b[A-Za-z_]\w*\b)/g;
    let result='',last=0,match;
    while((match=pattern.exec(source))){const token=match[0];let kind='';if(token.startsWith('#'))kind='comment';else if(/^[rubf]{0,2}['"]/i.test(token))kind='string';else if(/^\d/.test(token))kind='number';else if(keywords.has(token))kind='keyword';else if(builtins.has(token))kind='builtin';else if(/^\s*\(/.test(source.slice(match.index+token.length)))kind='function';
      result+=escape(source.slice(last,match.index))+(kind?'<span class="tok-'+kind+'">'+escape(token)+'</span>':escape(token));last=match.index+token.length;}
    return result+escape(source.slice(last));
  }
  function inline(text){
    const pattern=/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g;let out='',last=0,m;
    while((m=pattern.exec(text))){out+=escape(text.slice(last,m.index));const t=m[0];if(t[0]==='`')out+='<code>'+escape(t.slice(1,-1))+'</code>';else if(t.startsWith('**'))out+='<strong>'+escape(t.slice(2,-2))+'</strong>';else{const link=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(t);const href=link[2];if(/^https?:\/\//i.test(href))out+='<a href="'+escape(href)+'" target="_blank" rel="noopener noreferrer">'+escape(link[1])+'</a>';else if(/^[\p{L}\p{N}_./ -]+$/u.test(href)&&!href.split('/').includes('..'))out+='<button class="md-link" data-open="'+escape(href)+'">'+escape(link[1])+'</button>';else out+=escape(t);}last=m.index+t.length;}
    return out+escape(text.slice(last));
  }
  function markdown(text){
    const lines=text.replace(/\r\n/g,'\n').split('\n');let html='',list='',code=null,language='';
    const closeList=()=>{if(list){html+='</'+list+'>';list='';}};
    for(let i=0;i<lines.length;i++){const line=lines[i];if(/^\s*```/.test(line)){if(code!==null){html+='<pre><code>'+(/^(python|py)$/.test(language)?highlight(code.join('\n')):escape(code.join('\n')))+'</code></pre>';code=null;}else{closeList();code=[];language=line.trim().slice(3).trim();}continue;}if(code!==null){code.push(line);continue;}
      if(/^\s*\|?\s*:?-{3,}/.test(lines[i+1]||'')&&line.includes('|')){closeList();const cells=r=>r.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());html+='<div class="md-table-wrap"><table><thead><tr>'+cells(line).map(x=>'<th>'+inline(x)+'</th>').join('')+'</tr></thead><tbody>';i+=2;while(i<lines.length&&lines[i].includes('|')){html+='<tr>'+cells(lines[i]).map(x=>'<td>'+inline(x)+'</td>').join('')+'</tr>';i++;}i--;html+='</tbody></table></div>';continue;}
      const heading=/^(#{1,6})\s+(.+)$/.exec(line),item=/^\s*([-*]|\d+\.)\s+(.+)$/.exec(line);
      if(item){const type=/\d/.test(item[1])?'ol':'ul';if(list!==type){closeList();list=type;html+='<'+type+'>';}html+='<li>'+inline(item[2])+'</li>';continue;}closeList();
      if(heading)html+='<h'+heading[1].length+'>'+inline(heading[2])+'</h'+heading[1].length+'>';else if(/^>\s?/.test(line))html+='<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>';else if(/^\s*---+\s*$/.test(line))html+='<hr>';else if(line.trim())html+='<p>'+inline(line)+'</p>';
    }closeList();if(code!==null)html+='<pre><code>'+escape(code.join('\n'))+'</code></pre>';return html;
  }
  const sourceOf=cell=>Array.isArray(cell.source)?cell.source.join(''):String(cell.source||'');
  const cell=(kind,source='')=>({cell_type:kind,id:Math.random().toString(36).slice(2,10),metadata:{},source:source.split(/(?<=\n)/),...(kind==='code'?{execution_count:null,outputs:[]}:{})});
  function fromPython(source){const chunks=source.split(/\n\s*\n(?=\S)/).filter(x=>x.trim());return {cells:(chunks.length?chunks:['']).map(x=>cell('code',x+'\n')),metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'},language_info:{name:'python',version:'3'}},nbformat:4,nbformat_minor:5};}
  function parseNotebook(raw){const doc=JSON.parse(raw);if(doc.nbformat!==4||!Array.isArray(doc.cells)||doc.cells.length>300)throw Error('Notebook cần định dạng v4 và tối đa 300 ô.');for(const c of doc.cells){if(!['code','markdown','raw'].includes(c.cell_type)||(!Array.isArray(c.source)&&typeof c.source!=='string'))throw Error('Ô notebook không hợp lệ.');if(Array.isArray(c.source)&&c.source.some(x=>typeof x!=='string'))throw Error('Nội dung ô không hợp lệ.');if(sourceOf(c).length>200000)throw Error('Một ô tối đa 200.000 ký tự.');c.id||=Math.random().toString(36).slice(2,10);c.metadata??={};if(c.cell_type==='code'){c.outputs=Array.isArray(c.outputs)?c.outputs:[];c.execution_count??=null;}}return doc;}
  function descriptionFor(p){return '# '+p.title+'\n\n'+p.summary+'\n\n## Mục tiêu\n\n'+p.goal+'\n\n## Dữ liệu\n\n- [train.csv](data/train.csv) — dữ liệu huấn luyện.\n- [test.csv](data/test.csv) — dữ liệu cần dự đoán.\n\n> Dữ liệu đi kèm là mẫu nhỏ để thực hành.\n\n## Gợi ý\n\n'+p.hint+'\n\n## Validation\n\n'+p.validation+'\n\n## Bài nộp\n\nMetric: **'+p.metric+'**.\n\nHai cột: `id,'+p.target+'`. Mỗi ID phải xuất hiện đúng một lần.\n\n'+(p.labels?'Nhãn hợp lệ: '+p.labels.map(x=>'`'+x+'`').join(', ')+'.':'Giá trị là số hữu hạn'+(p.minValue!==undefined?' ≥ '+p.minValue:'')+'.')+'\n\n```csv\n'+(p.sample||'id,'+p.target+'\n')+'```\n\nChưa có máy chấm giữ nhãn kiểm thử riêng; bản hiện tại kiểm tra định dạng CSV.\n';}
  return {escape,highlight,markdown,sourceOf,cell,fromPython,parseNotebook,descriptionFor};
})();

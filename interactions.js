// One click stream for mouse, pen and touch. Do not also handle touchend/dblclick.
export function bindImageGesture(image,{getClicks,onSingle,onReroll,now=Date.now,delay=380}){
    let count=0,last=0,point=null,down=null,blocked=false,timer;
    const reset=()=>{count=0;clearTimeout(timer);};
    image.addEventListener('pointerdown',e=>{
        if(e.isPrimary===false){blocked=true;reset();return;}
        blocked=false;down={x:e.clientX,y:e.clientY,time:now()};
    });
    image.addEventListener('pointermove',e=>{
        if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>12){blocked=true;reset();}
    });
    image.addEventListener('pointercancel',()=>{blocked=true;down=null;reset();});
    image.addEventListener('pointerup',()=>{if(down&&now()-down.time>500){blocked=true;reset();}down=null;});
    image.addEventListener('click',e=>{
        if(e.button>0||blocked)return;
        const time=now(),near=!point||Math.hypot(e.clientX-point.x,e.clientY-point.y)<=24;
        count=time-last<=delay&&near?count+1:1;last=time;point={x:e.clientX,y:e.clientY};clearTimeout(timer);
        if(count===(getClicks()===3?3:2)){reset();e.preventDefault();onReroll();return;}
        const clicks=count;timer=setTimeout(()=>{if(clicks===1)onSingle();count=0;},delay);
    });
    image.addEventListener('dblclick',e=>e.preventDefault());
    return reset;
}

export function createFloatingEntry({settings,save,open,icon,documentImpl=document,windowImpl=window}){
    if(!settings.floatingEntry)return ()=>{};
    const button=documentImpl.createElement('button');button.id='miao-nai-floating';button.type='button';
    button.className='miao-floating-entry';button.innerHTML=icon;button.setAttribute('aria-label','打开喵喵文生图');button.title='喵喵文生图 · 拖动调整位置';
    documentImpl.body.append(button);let down,moved=false;
    const bounds=()=>{const x=Math.max(0,(windowImpl.visualViewport?.width||windowImpl.innerWidth)-56),y=Math.max(0,(windowImpl.visualViewport?.height||windowImpl.innerHeight)-56);return {x,y,minX:Math.min(8,x),minY:Math.min(8,y)};};
    const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    const dock=(left,top,b)=>({edgeX:left-b.minX<=28?'left':b.x-left<=28?'right':null,edgeY:top-b.minY<=28?'top':b.y-top<=28?'bottom':null});
    const fit=()=>{
        const b=bounds(),p=settings.floatingPosition;
        let left=clamp(p?Math.max(0,Math.min(1,p.x))*b.x:b.x-12,b.minX,b.x),top=clamp(p?Math.max(0,Math.min(1,p.y))*b.y:b.y-100,b.minY,b.y);
        const edges=p&&'edgeX' in p?p:dock(left,top,b);
        if(edges.edgeX)left=edges.edgeX==='left'?b.minX:b.x;if(edges.edgeY)top=edges.edgeY==='top'?b.minY:b.y;
        button.style.left=left+'px';button.style.top=top+'px';
        if(p&&!('edgeX' in p)&&(edges.edgeX||edges.edgeY)){settings.floatingPosition={...p,...edges};save();}
    };
    fit();windowImpl.addEventListener('resize',fit);windowImpl.visualViewport?.addEventListener('resize',fit);
    button.addEventListener('pointerdown',e=>{if(e.button>0||e.isPrimary===false)return;moved=false;down={id:e.pointerId,x:e.clientX,y:e.clientY,left:button.offsetLeft,top:button.offsetTop};button.setPointerCapture?.(e.pointerId);});
    button.addEventListener('pointermove',e=>{if(!down||e.pointerId!==down.id)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.hypot(dx,dy)>8)moved=true;if(!moved)return;const b=bounds();button.style.left=clamp(down.left+dx,b.minX,b.x)+'px';button.style.top=clamp(down.top+dy,b.minY,b.y)+'px';});
    button.addEventListener('pointerup',e=>{if(!down||e.pointerId!==down.id)return;if(moved){const b=bounds();settings.floatingPosition={x:b.x?button.offsetLeft/b.x:0,y:b.y?button.offsetTop/b.y:0,...dock(button.offsetLeft,button.offsetTop,b)};fit();save();}down=null;});
    button.addEventListener('pointercancel',()=>{down=null;moved=true;fit();});
    button.addEventListener('click',e=>{if(moved&&e.detail!==0){e.preventDefault();moved=false;return;}open();});
    return ()=>{button.remove();windowImpl.removeEventListener('resize',fit);windowImpl.visualViewport?.removeEventListener('resize',fit);};
}

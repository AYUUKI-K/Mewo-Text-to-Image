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
export function clampImageView(view,{width,height,imageWidth,imageHeight}){
    const scale=Math.max(1,Math.min(8,Number(view.scale)||1));
    const fit=Math.min(width/(imageWidth||width||1),height/(imageHeight||height||1));
    const limitX=Math.max(0,((imageWidth||width)*fit*scale-width)/2),limitY=Math.max(0,((imageHeight||height)*fit*scale-height)/2);
    return {scale,x:Math.max(-limitX,Math.min(limitX,Number(view.x)||0)),y:Math.max(-limitY,Math.min(limitY,Number(view.y)||0))};
}
export function bindImageZoom(viewer,image){
    let view={scale:1,x:0,y:0},gesture=null;
    const pointers=new Map(),reset=document.createElement('button');reset.type='button';reset.className='miao-button miao-zoom-reset';reset.setAttribute('aria-label','复原图片大小');reset.hidden=true;viewer.append(reset);
    image.draggable=false;image.tabIndex=0;image.setAttribute('aria-label','图片预览：双指或滚轮缩放，双击放大或复原，方向键移动，0 复原');
    const dimensions=()=>{const r=viewer.getBoundingClientRect();return {width:r.width,height:r.height,imageWidth:image.naturalWidth,imageHeight:image.naturalHeight};};
    const paint=next=>{
        view=clampImageView(next,dimensions());image.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;
        viewer.dataset.zoomScale=String(view.scale);viewer.dataset.zoomed=String(view.scale>1);reset.hidden=view.scale===1;reset.textContent=`${Math.round(view.scale*100)}% · 复原`;
    };
    const center=()=>{const r=viewer.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};};
    const pair=()=>{const [a,b]=[...pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)};};
    const begin=()=>{
        const c=center();
        if(pointers.size===2){const p=pair();gesture={...p,scale:view.scale,anchorX:(p.x-c.x-view.x)/view.scale,anchorY:(p.y-c.y-view.y)/view.scale};}
        else if(pointers.size===1)gesture={...pointers.values().next().value,view:{...view}};
        else gesture=null;
        viewer.dataset.dragging=String(pointers.size>0&&view.scale>1);
    };
    const zoomAt=(scale,x,y)=>{const c=center(),next=Math.max(1,Math.min(8,scale));paint({scale:next,x:x-c.x-(x-c.x-view.x)*next/view.scale,y:y-c.y-(y-c.y-view.y)*next/view.scale});};
    const down=event=>{
        if(event.target.closest('button')||event.button>0||pointers.size>=2)return;
        pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});try{viewer.setPointerCapture(event.pointerId);}catch{}begin();
    };
    const move=event=>{
        if(!pointers.has(event.pointerId))return;event.preventDefault();pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(pointers.size===2){const p=pair(),c=center(),scale=Math.max(1,Math.min(8,gesture.scale*p.distance/Math.max(1,gesture.distance)));paint({scale,x:p.x-c.x-gesture.anchorX*scale,y:p.y-c.y-gesture.anchorY*scale});}
        else if(gesture?.view)paint({...gesture.view,x:gesture.view.x+event.clientX-gesture.x,y:gesture.view.y+event.clientY-gesture.y});
        viewer.dataset.dragging=String(view.scale>1);
    };
    const up=event=>{pointers.delete(event.pointerId);begin();};
    const cancel=()=>{pointers.clear();begin();};
    const double=event=>{if(event.target.closest('button'))return;event.preventDefault();event.stopPropagation();zoomAt(view.scale>1?1:2,event.clientX,event.clientY);};
    const wheel=event=>{event.preventDefault();event.stopPropagation();const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?dimensions().height:1);zoomAt(view.scale*Math.exp(-delta*.0015),event.clientX,event.clientY);};
    const key=event=>{
        const c=center();
        if(['+','=','-','0'].includes(event.key)){event.preventDefault();event.stopPropagation();zoomAt(event.key==='0'?1:view.scale*(event.key==='-'?.8:1.25),c.x,c.y);}
        else if(view.scale>1&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();paint({...view,x:view.x+(event.key==='ArrowLeft'?40:event.key==='ArrowRight'?-40:0),y:view.y+(event.key==='ArrowUp'?40:event.key==='ArrowDown'?-40:0)});}
    };
    reset.onclick=()=>paint({scale:1,x:0,y:0});
    const resize=()=>paint(view),observer=new ResizeObserver(resize);observer.observe(viewer);image.addEventListener('load',resize);
    const handlers={pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,lostpointercapture:up,dblclick:double,wheel,keydown:key};
    for(const [name,handler] of Object.entries(handlers))viewer.addEventListener(name,handler,{passive:false});
    paint(view);
    return ()=>{observer.disconnect();image.removeEventListener('load',resize);for(const [name,handler] of Object.entries(handlers))viewer.removeEventListener(name,handler);pointers.clear();reset.remove();};
}

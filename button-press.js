// Mobile WebViews may omit the compatibility click after touch. Handle a short
// stationary release directly, then consume its delayed click (even if removed).
const documents=new WeakMap();
export function bindButtonPress(button,activate,{now=Date.now,pointerEvents=typeof PointerEvent!=='undefined'}={}){
    const doc=button.ownerDocument;
    let shared=doc&&documents.get(doc),down=null,last=null,blocked=false;
    if(doc&&!shared){
        shared={last:null};documents.set(doc,shared);
        const reset=e=>{shared.last=null;if(e.pointerType==='touch')shared.multi=e.isPrimary===false;else if(e.touches)shared.multi=e.touches.length>1;};
        doc.addEventListener('pointerdown',reset,true);doc.addEventListener('touchstart',reset,true);
        doc.addEventListener('click',event=>{
            const p=shared.last;if(!p||Date.now()-p.time>800||event.detail===0&&!event.sourceCapabilities?.firesTouchEvents)return;
            if(Math.hypot(event.clientX-p.x,event.clientY-p.y)>32)return;
            event.preventDefault();event.stopImmediatePropagation();shared.last=null;
        },true);
    }
    const begin=(x,y,id)=>{blocked=false;down=button.disabled?null:{x,y,id,time:now(),moved:false};};
    const move=(x,y)=>{if(down&&Math.hypot(x-down.x,y-down.y)>12){down.moved=true;blocked=true;}};
    const cancel=()=>{down=null;blocked=true;};
    const end=(event,x,y,id)=>{
        const p=down;down=null;if(!p||p.id!==id||p.moved||shared?.multi||button.disabled||now()-p.time>700||Math.hypot(x-p.x,y-p.y)>12){blocked=true;return;}
        const rect=button.getBoundingClientRect();if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom){blocked=true;return;}
        event.preventDefault();event.stopPropagation();last={time:now(),x,y};if(shared)shared.last={time:Date.now(),x,y};activate(event);
    };
    if(pointerEvents){
        button.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'){last=null;blocked=false;return;}if(e.isPrimary===false){cancel();return;}begin(e.clientX,e.clientY,e.pointerId);});
        button.addEventListener('pointermove',e=>{if(e.pointerId===down?.id)move(e.clientX,e.clientY);});
        button.addEventListener('pointerup',e=>{if(e.pointerType==='touch')end(e,e.clientX,e.clientY,e.pointerId);});
        button.addEventListener('pointercancel',cancel);
    }else{
        button.addEventListener('touchstart',e=>{if(e.touches.length!==1){cancel();return;}const t=e.touches[0];begin(t.clientX,t.clientY,t.identifier);},{passive:true});
        button.addEventListener('touchmove',e=>{const t=[...e.touches].find(t=>t.identifier===down?.id);if(t)move(t.clientX,t.clientY);},{passive:true});
        button.addEventListener('touchend',e=>{const t=[...e.changedTouches].find(t=>t.identifier===down?.id);if(t)end(e,t.clientX,t.clientY,t.identifier);},{passive:false});
        button.addEventListener('touchcancel',cancel);
    }
    button.addEventListener('click',event=>{
        if(button.disabled)return;
        if((blocked||last&&now()-last.time<800)&&(event.detail!==0||event.sourceCapabilities?.firesTouchEvents)){event.preventDefault();event.stopImmediatePropagation();return;}
        event.preventDefault();event.stopPropagation();activate(event);
    });
}

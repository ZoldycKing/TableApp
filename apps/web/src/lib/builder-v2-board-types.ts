export type BuilderV2BoardScope={screenId:string;nodeId:string;itemId:string;recordId?:string}
export type BuilderV2BoardState={revision:string;fingerprint:string;recordLabel:string;value:string|null;choices:{id:string;name:string}[]}
export type BuilderV2BoardInspection={ok:true;state:BuilderV2BoardState}|{ok:false;error:string;stale?:boolean}
export type BuilderV2BoardRequest=BuilderV2BoardScope&{revision:string;fingerprint:string;requestId:string;value:string|null}

/** One automatic chain may visit a location once, with a fixed ceiling even for newly created records. User navigation starts a fresh chain. */
export class BuilderV2EnterNavigation{
  private last:string|null=null
  private automatic=false
  private visited=new Set<string>()
  private blocked=false
  prepare(automatic=false){this.automatic=automatic;if(!automatic)this.visited.clear()}
  visit(key:string){
    if(this.last===key)return this.blocked
    if(!this.automatic)this.visited.clear()
    this.automatic=false;this.last=key
    this.blocked=this.visited.has(key)||this.visited.size>=8
    this.visited.add(key)
    return this.blocked
  }
}

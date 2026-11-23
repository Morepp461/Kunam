import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "./entity-profile-link.css";

export function MemberProfileLink({memberId,children,className=""}:{memberId:string|null|undefined;children:ReactNode;className?:string}){
 if(!memberId)return <>{children}</>;
 return <Link className={"caleris-entity-profile-link "+className} to={"/member/"+encodeURIComponent(memberId)}>{children}</Link>;
}
export function TeamProfileLink({teamId,children,className=""}:{teamId:string|null|undefined;children:ReactNode;className?:string}){
 if(!teamId)return <>{children}</>;
 return <Link className={"caleris-entity-profile-link "+className} to={"/team/"+encodeURIComponent(teamId)}>{children}</Link>;
}

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "./entity-profile-link.css";

const PUBLIC_MEMBER_ID=/^[A-Z0-9]{12,16}$/;
const TEAM_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function MemberProfileLink({memberId,children,className=""}:{memberId:string|null|undefined;children:ReactNode;className?:string}){
 const publicId=memberId?.trim().toUpperCase()||"";
 if(!PUBLIC_MEMBER_ID.test(publicId))return <>{children}</>;
 return <Link className={"caleris-entity-profile-link "+className} to={"/member/"+encodeURIComponent(publicId)}>{children}</Link>;
}
export function TeamProfileLink({teamId,children,className=""}:{teamId:string|null|undefined;children:ReactNode;className?:string}){
 const id=teamId?.trim()||"";
 if(!TEAM_ID.test(id))return <>{children}</>;
 return <Link className={"caleris-entity-profile-link "+className} to={"/team/"+encodeURIComponent(id)}>{children}</Link>;
}

import { useEffect, useState } from "react";
import {
  getCaleDesign,
  resolveCaleOutfit,
  type CaleContext,
  type CaleOutfit,
} from "./cale/manifest";

const OUTFIT_ASSETS: Record<CaleOutfit, string> = {
  formal: "/assets/cale/cale-formal.webp",
  fia: "/assets/cale/cale-fia.webp",
  racing: "/assets/cale/cale-racing.webp",
};

type CaleMascotProps = {
  designId?: string;
  context?: CaleContext;
  outfitOverride?: CaleOutfit;
  size?: number | string;
  className?: string;
  showCaption?: boolean;
  eager?: boolean;
};

export default function CaleMascot({
  designId = "idle_default",
  context = "general",
  outfitOverride,
  size = 180,
  className = "",
  showCaption = false,
  eager = false,
}: CaleMascotProps) {
  const design = getCaleDesign(designId);
  const outfit = outfitOverride ?? design?.outfit ?? resolveCaleOutfit(context);
  const source = OUTFIT_ASSETS[outfit];
  const [imageSource, setImageSource] = useState(source);

  useEffect(() => {
    setImageSource(source);
  }, [source]);

  const handleImageError = () => {
    if (imageSource !== OUTFIT_ASSETS.racing) {
      setImageSource(OUTFIT_ASSETS.racing);
    }
  };

  const label = design?.description ?? "Cale, maskot resmi CALERIS MASTERS";

  return (
    <figure
      className={`cale-mascot ${className}`.trim()}
      data-cale-design={design?.id ?? "idle_default"}
      data-cale-category={design?.category ?? "idle"}
      data-cale-outfit={outfit}
      style={{ width: size }}
    >
      <div className="cale-mascot__art">
        <img
          src={imageSource}
          alt={`Cale — ${label}`}
          width="256"
          height="384"
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={handleImageError}
          draggable={false}
        />
        {design?.marker && (
          <span className="cale-mascot__marker" aria-hidden="true">
            {design.marker}
          </span>
        )}
      </div>
      {showCaption && (
        <figcaption className="cale-mascot__caption">
          <strong>Cale</strong>
          <span>{label}</span>
        </figcaption>
      )}
    </figure>
  );
}

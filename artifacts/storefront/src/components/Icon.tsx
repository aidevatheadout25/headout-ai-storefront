import type { CSSProperties } from "react";

type IconName =
  | "search"
  | "spark"
  | "bulb"
  | "checkmark"
  | "cross"
  | "chevron-down"
  | "chevron-right"
  | "arrow-right"
  | "info-circle"
  | "user"
  | "users"
  | "globe"
  | "zap"
  | "hourglass"
  | "shield-tick"
  | "mail";

const ICON_PATHS: Record<IconName, string> = {
  search: "/design-system/assets/icons/search.svg",
  spark: "/design-system/assets/icons/spark.svg",
  bulb: "/design-system/assets/icons/bulb.svg",
  checkmark: "/design-system/assets/icons/checkmark.svg",
  cross: "/design-system/assets/icons/cross.svg",
  "chevron-down": "/design-system/assets/icons/chevron/chevron-down.svg",
  "chevron-right": "/design-system/assets/icons/chevron/chevron-right.svg",
  "arrow-right": "/design-system/assets/icons/arrow/arrow-right.svg",
  "info-circle": "/design-system/assets/icons/info-circle.svg",
  user: "/design-system/assets/icons/user.svg",
  users: "/design-system/assets/icons/users.svg",
  globe: "/design-system/assets/icons/globe.svg",
  zap: "/design-system/assets/icons/zap.svg",
  hourglass: "/design-system/assets/icons/hourglass.svg",
  "shield-tick": "/design-system/assets/icons/shield-tick.svg",
  mail: "/design-system/assets/icons/mail.svg",
};

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
};

export function Icon({ name, size = 24, className, style }: IconProps) {
  return (
    <span
      role="img"
      aria-hidden="true"
      className={`onix-icon${className ? ` ${className}` : ""}`}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url(${ICON_PATHS[name]})`,
        maskImage: `url(${ICON_PATHS[name]})`,
        ...style,
      }}
    />
  );
}

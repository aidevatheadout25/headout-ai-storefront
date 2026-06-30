import type { CSSProperties } from "react";
import { formatToolType, type ToolType } from "@/lib/types";
import { TYPE_TAG_STYLES } from "@/lib/registry";

type TypeTagProps = {
  type: ToolType;
};

export function TypeTag({ type }: TypeTagProps) {
  const styles = TYPE_TAG_STYLES[type];

  return (
    <span
      className="type-tag t-tag-rg"
      data-type={type}
      style={
        {
          "--type-tag-bg": styles.bg,
          "--type-tag-color": styles.color,
          "--type-tag-bg-dark": styles.bgDark,
          "--type-tag-color-dark": styles.colorDark,
        } as CSSProperties
      }
    >
      {formatToolType(type)}
    </span>
  );
}

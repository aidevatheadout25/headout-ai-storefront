import type { ToolType } from "@/lib/types";
import { TypeTag } from "@/components/TypeTag";

type TypeTagsProps = {
  types: ToolType[];
};

export function TypeTags({ types }: TypeTagsProps) {
  return (
    <div className="type-tags">
      {types.map((type) => (
        <TypeTag key={type} type={type} />
      ))}
    </div>
  );
}

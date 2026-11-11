import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

function pathToRoot(slug: string): string {
  let rootPath = slug.split("/").filter((x2) => x2 !== "").slice(0, -1).map((_2) => "..").join("/")
  if (rootPath.length === 0) {
    rootPath = "."
  }
  return rootPath
}

const CustomPageTitle: QuartzComponent = ({ fileData, cfg, displayClass }: QuartzComponentProps) => {
  const isKm = fileData.slug === "km" || fileData.slug?.startsWith("km/")
  const title = isKm ? "ណូលហែម" : (cfg?.pageTitle ?? "Nolheim")
  let baseDir = pathToRoot(fileData.slug || "")
  if (isKm) {
    baseDir = fileData.slug === "km" || fileData.slug === "km/index" ? "." : (baseDir === "." ? "./km/" : baseDir + "/km/")
  }
  return (
    <h2 class={classNames(displayClass, "page-title")}>
      <a href={baseDir}>{title}</a>
    </h2>
  )
}

CustomPageTitle.css = `
.page-title {
  font-size: 1.75rem;
  margin: 0;
  font-family: var(--titleFont);
}
`

export default (() => CustomPageTitle) satisfies QuartzComponentConstructor

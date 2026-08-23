/**
 * CSS Modules の型宣言。
 *
 * Next.js は next-env.d.ts で同等の宣言を生成するが、それは gitignore 済みで CI では
 * build 前に存在しない。typecheck が build より先に走るため、ここで宣言を固定して
 * tsc が生成ファイルに依存しないようにする（Next の宣言と同形なのでマージされる）。
 */
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

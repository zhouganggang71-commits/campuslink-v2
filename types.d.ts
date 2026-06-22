declare module "pdf-parse" {
  interface PDFData {
    text: string;
    numpages: number;
    info: Record<string, any>;
    metadata: any;
    version: string;
  }
  function PDFParse(buffer: Buffer): Promise<PDFData>;
  export { PDFParse };
  export default PDFParse;
}

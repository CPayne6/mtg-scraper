"use client"

import { LibraryEntry } from "./library.types"
import { parseManaboxCsv, parseManaboxTxt } from "@/utils/manabox"

export const LIBRARY_KEY = 'library'



export const formatStorageName = (name: string) => name.toLocaleLowerCase().replaceAll(/,\/\\/g, '')

export const supportedFileTypes = ["text/csv", "text/plain"] as const

type ParserMap = {
  [K in typeof supportedFileTypes[number]]: (s: string) => LibraryEntry[]
}

const fileParserMap: ParserMap = {
  'text/csv': parseManaboxCsv,
  'text/plain': parseManaboxTxt
}

export const parseFile = async (file: File): Promise<LibraryEntry[]> => {
  const content = await file.text();
  if (!supportedFileTypes.includes(file.type as typeof supportedFileTypes[0])){
    alert("Unsupported file type encountered: " + file.type)
    return []
  }
  const parser = fileParserMap[file.type as typeof supportedFileTypes[0]]
  return parser(content)
}
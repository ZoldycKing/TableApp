'use client'
import {createContext,type CSSProperties} from 'react'

/** A portaled runtime dialog inherits the application's theme, not the editor chrome. */
export const BuilderThemeContext=createContext<{className:string;style:CSSProperties;scheme:string}|null>(null)

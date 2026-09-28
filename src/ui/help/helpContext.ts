import { createContext, useContext } from 'react';

/** Opens the Help view, optionally at a section or subsection id. */
export const HelpContext = createContext<(section?: string) => void>(() => undefined);

export const useOpenHelp = () => useContext(HelpContext);

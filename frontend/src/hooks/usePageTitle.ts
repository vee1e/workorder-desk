import { useEffect } from 'react';

export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · Work Order Desk` : 'Work Order Desk';
  }, [title]);
}
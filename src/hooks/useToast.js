import { useContext } from 'react';
import { ToastContext } from '../components/ui/Toast';

export function useToast() {
  return useContext(ToastContext);
}

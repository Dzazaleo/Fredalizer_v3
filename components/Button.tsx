import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  variant = 'primary', 
  children, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 focus:ring-offset-slate-900",
    secondary: "bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 focus:ring-slate-500 focus:ring-offset-slate-900",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 focus:ring-offset-slate-900",
    ghost: "text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus:ring-slate-500 focus:ring-offset-slate-900"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`} 
      {...props}
    >
      {children}
    </button>
  );
};
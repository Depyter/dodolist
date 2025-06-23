import React from 'react';

interface TexturedBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  intensity?: 'subtle' | 'normal' | 'strong';
}

const TexturedBackground: React.FC<TexturedBackgroundProps> = ({ 
  children, 
  className = '',
  intensity = 'normal'
}) => {
  const textureClass = intensity === 'subtle' 
    ? 'noise-texture-subtle' 
    : intensity === 'strong' 
      ? 'noise-texture-strong' 
      : 'noise-texture';

  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-0">
        <div 
          className={textureClass} 
          style={{ 
            width: '100%', 
            height: '100%', 
            pointerEvents: 'none' 
          }} 
        />
      </div>
      {children && <div className="relative z-10">{children}</div>}
    </div>
  );
};

export default TexturedBackground;
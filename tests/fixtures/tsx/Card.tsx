import React from 'react'

interface CardProps {
  title: string
  description?: string
  imageUrl?: string
}

const Card: React.FC<CardProps> = ({ title, description, imageUrl }) => (
  <div className="card" style={{ width: 240, padding: 16, borderRadius: 8, backgroundColor: '#ffffff' }}>
    {imageUrl && <img src={imageUrl} alt={title} style={{ width: '100%' }} />}
    <h2 style={{ fontSize: 18, margin: 0 }}>{title}</h2>
    <p style={{ color: '#555555' }}>{description}</p>
    <button type="button">詳細</button>
  </div>
)

export default Card

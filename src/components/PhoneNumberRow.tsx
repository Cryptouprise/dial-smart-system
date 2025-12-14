import React from 'react';

interface PhoneNumberRowProps {
  number: any;
  onEdit?: (number: any) => void;
  onDelete?: (number: any) => void;
}

export const PhoneNumberRow: React.FC<PhoneNumberRowProps> = ({ number, onEdit, onDelete }) => {
  return (
    <tr className="border-b">
      <td className="py-2 px-4">{number.number || 'N/A'}</td>
      <td className="py-2 px-4">{number.status || 'unknown'}</td>
      <td className="py-2 px-4">{number.daily_calls || 0}</td>
    </tr>
  );
};

export default PhoneNumberRow;

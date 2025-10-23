# 🎯 Questionary

A modern, interactive quiz application for educational purposes. Built with React, TypeScript, and Tailwind CSS for a smooth and responsive user experience.

## ✨ Features

- **📚 Multiple Question Formats**: Support for multiple choice (MC) and true/false (TF) questions
- **📄 Flexible Data Sources**: Load questions from JSON or YAML files
- **🎲 Quiz Customization**: Randomize question order for varied practice sessions
- **📊 Progress Tracking**: Real-time progress monitoring and detailed results
- **🔄 Session Persistence**: Resume unfinished quizzes automatically
- **📱 Responsive Design**: Optimized for desktop and mobile devices
- **🎨 Modern UI**: Clean, dark-themed interface with smooth animations

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Wildeax/Questionary.git
   cd Questionary
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser** and navigate to `http://localhost:5173`

## 📖 Usage

### Loading Questions

The application supports two ways to load quiz questions:

1. **Paste Content**: Copy and paste JSON or YAML formatted questions directly into the text area
2. **Upload File**: Upload `.json`, `.yaml`, or `.yml` files containing your questions

### Question Format

All documents must start with metadata containing the quiz name (required) and optional author:

```yaml
- metadata:
  name: "Your Quiz Name"  # Required
  author: "Your Name"     # Optional
```

#### Multiple Choice Questions
```yaml
- id: Q001
  type: mc
  prompt: "Your question here?"
  options:
    - "Option A"
    - "Option B"
    - "Option C"
    - "Option D"
  answer: 2  # Index of correct answer (0-based)
  explanation: "Optional explanation for the correct answer"
```

#### True/False Questions
```yaml
- id: Q002
  type: tf
  prompt: "This statement is true."
  answer: true
  explanation: "Optional explanation"
```

## 🛠️ Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Project Structure

```
src/
├── components/          # React components
│   ├── SetupView.tsx    # Question loading interface
│   ├── SettingsView.tsx # Quiz configuration
│   ├── QuestionPage.tsx # Quiz taking interface
│   └── ResultsView.tsx  # Results display
├── types.ts            # TypeScript type definitions
├── utils.ts            # Utility functions
├── storage.ts          # Local storage management
├── templates.ts        # Question format templates
└── export.ts           # Data export utilities
```

### Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **js-yaml** - YAML parsing
- **ESLint** - Code linting

## 📊 Sample Questions

The repository includes sample questions covering various educational topics. You can easily create your own question sets for:

- Academic subjects and courses
- Certification exam preparation
- Professional training modules
- Assessment and testing scenarios

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built for educational and assessment purposes
- Inspired by the need for effective, interactive study tools
- Questions can be customized for any subject matter

---

**Happy studying! 🎓** Master any subject with confidence.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function populateDefaultImages() {
  try {
    console.log('🖼️  Starting to populate default images...');

    // Update courses with default images
    const courses = await prisma.course.findMany({
      where: {
        OR: [
          { image: null },
          { image: '' }
        ]
      }
    });

    console.log(`📚 Found ${courses.length} courses without images`);

    for (const course of courses) {
      const defaultImage = getDefaultCourseImage(course.category, course.level);
      
      await prisma.course.update({
        where: { id: course.id },
        data: { image: defaultImage }
      });

      console.log(`✅ Updated course: ${course.title} -> ${defaultImage}`);
    }

    // Update tests with default images
    const tests = await prisma.test.findMany({
      where: {
        OR: [
          { image: null },
          { image: '' }
        ]
      }
    });

    console.log(`📝 Found ${tests.length} tests without images`);

    for (const test of tests) {
      const defaultImage = getDefaultTestImage(test.category, test.level);
      
      await prisma.test.update({
        where: { id: test.id },
        data: { image: defaultImage }
      });

      console.log(`✅ Updated test: ${test.title} -> ${defaultImage}`);
    }

    console.log('🎉 Successfully populated default images!');
    console.log(`📊 Updated ${courses.length} courses and ${tests.length} tests`);

  } catch (error) {
    console.error('❌ Error populating default images:', error);
  } finally {
    await prisma.$disconnect();
  }
}

function getDefaultCourseImage(category, level) {
  const categoryImages = {
    GRAMMAR: {
      A1: '/images/defaults/courses/grammar-a1.html',
      A2: '/images/defaults/courses/grammar-a2.html',
      B1: '/images/defaults/courses/grammar-b1.html',
      B2: '/images/defaults/courses/grammar-b2.html',
      C1: '/images/defaults/courses/grammar-c1.html',
      C2: '/images/defaults/courses/grammar-c2.html',
    },
    LISTENING: {
      A1: '/images/defaults/courses/listening-a1.html',
      A2: '/images/defaults/courses/listening-a2.html',
      B1: '/images/defaults/courses/listening-b1.html',
      B2: '/images/defaults/courses/listening-b2.html',
      C1: '/images/defaults/courses/listening-c1.html',
      C2: '/images/defaults/courses/listening-c2.html',
    },
    SPEAKING: {
      A1: '/images/defaults/courses/speaking-a1.html',
      A2: '/images/defaults/courses/speaking-a2.html',
      B1: '/images/defaults/courses/speaking-b1.html',
      B2: '/images/defaults/courses/speaking-b2.html',
      C1: '/images/defaults/courses/speaking-c1.html',
      C2: '/images/defaults/courses/speaking-c2.html',
    },
    READING: {
      A1: '/images/defaults/courses/reading-a1.html',
      A2: '/images/defaults/courses/reading-a2.html',
      B1: '/images/defaults/courses/reading-b1.html',
      B2: '/images/defaults/courses/reading-b2.html',
      C1: '/images/defaults/courses/reading-c1.html',
      C2: '/images/defaults/courses/reading-c2.html',
    },
    WRITING: {
      A1: '/images/defaults/courses/writing-a1.html',
      A2: '/images/defaults/courses/writing-a2.html',
      B1: '/images/defaults/courses/writing-b1.html',
      B2: '/images/defaults/courses/writing-b2.html',
      C1: '/images/defaults/courses/writing-c1.html',
      C2: '/images/defaults/courses/writing-c2.html',
    },
    VOCABULARY: {
      A1: '/images/defaults/courses/vocabulary-a1.html',
      A2: '/images/defaults/courses/vocabulary-a2.html',
      B1: '/images/defaults/courses/vocabulary-b1.html',
      B2: '/images/defaults/courses/vocabulary-b2.html',
      C1: '/images/defaults/courses/vocabulary-c1.html',
      C2: '/images/defaults/courses/vocabulary-c2.html',
    },
  };

  const categoryImage = categoryImages[category];
  if (categoryImage && categoryImage[level]) {
    return categoryImage[level];
  }

  return '/images/defaults/courses/default.html';
}

function getDefaultTestImage(category, level) {
  const categoryImages = {
    TCF: {
      A1: '/images/defaults/tests/tcf-a1.html',
      A2: '/images/defaults/tests/tcf-a2.html',
      B1: '/images/defaults/tests/tcf-b1.html',
      B2: '/images/defaults/tests/tcf-b2.html',
      C1: '/images/defaults/tests/tcf-c1.html',
      C2: '/images/defaults/tests/tcf-c2.html',
    },
    TEF: {
      A1: '/images/defaults/tests/tef-a1.html',
      A2: '/images/defaults/tests/tef-a2.html',
      B1: '/images/defaults/tests/tef-b1.html',
      B2: '/images/defaults/tests/tef-b2.html',
      C1: '/images/defaults/tests/tef-c1.html',
      C2: '/images/defaults/tests/tef-c2.html',
    },
    DELF: {
      A1: '/images/defaults/tests/delf-a1.html',
      A2: '/images/defaults/tests/delf-a2.html',
      B1: '/images/defaults/tests/delf-b1.html',
      B2: '/images/defaults/tests/delf-b2.html',
      C1: '/images/defaults/tests/delf-c1.html',
      C2: '/images/defaults/tests/delf-c2.html',
    },
    DALF: {
      A1: '/images/defaults/tests/dalf-a1.html',
      A2: '/images/defaults/tests/dalf-a2.html',
      B1: '/images/defaults/tests/dalf-b1.html',
      B2: '/images/defaults/tests/dalf-b2.html',
      C1: '/images/defaults/tests/dalf-c1.html',
      C2: '/images/defaults/tests/dalf-c2.html',
    },
    GRAMMAR: {
      A1: '/images/defaults/tests/grammar-a1.html',
      A2: '/images/defaults/tests/grammar-a2.html',
      B1: '/images/defaults/tests/grammar-b1.html',
      B2: '/images/defaults/tests/grammar-b2.html',
      C1: '/images/defaults/tests/grammar-c1.html',
      C2: '/images/defaults/tests/grammar-c2.html',
    },
    LISTENING: {
      A1: '/images/defaults/tests/listening-a1.html',
      A2: '/images/defaults/tests/listening-a2.html',
      B1: '/images/defaults/tests/listening-b1.html',
      B2: '/images/defaults/tests/listening-b2.html',
      C1: '/images/defaults/tests/listening-c1.html',
      C2: '/images/defaults/tests/listening-c2.html',
    },
    SPEAKING: {
      A1: '/images/defaults/tests/speaking-a1.html',
      A2: '/images/defaults/tests/speaking-a2.html',
      B1: '/images/defaults/tests/speaking-b1.html',
      B2: '/images/defaults/tests/speaking-b2.html',
      C1: '/images/defaults/tests/speaking-c1.html',
      C2: '/images/defaults/tests/speaking-c2.html',
    },
    READING: {
      A1: '/images/defaults/tests/reading-a1.html',
      A2: '/images/defaults/tests/reading-a2.html',
      B1: '/images/defaults/tests/reading-b1.html',
      B2: '/images/defaults/tests/reading-b2.html',
      C1: '/images/defaults/tests/reading-c1.html',
      C2: '/images/defaults/tests/reading-c2.html',
    },
    WRITING: {
      A1: '/images/defaults/tests/writing-a1.html',
      A2: '/images/defaults/tests/writing-a2.html',
      B1: '/images/defaults/tests/writing-b1.html',
      B2: '/images/defaults/tests/writing-b2.html',
      C1: '/images/defaults/tests/writing-c1.html',
      C2: '/images/defaults/tests/writing-c2.html',
    },
    VOCABULARY: {
      A1: '/images/defaults/tests/vocabulary-a1.html',
      A2: '/images/defaults/tests/vocabulary-a2.html',
      B1: '/images/defaults/tests/vocabulary-b1.html',
      B2: '/images/defaults/tests/vocabulary-b2.html',
      C1: '/images/defaults/tests/vocabulary-c1.html',
      C2: '/images/defaults/tests/vocabulary-c2.html',
    },
  };

  const categoryImage = categoryImages[category];
  if (categoryImage && categoryImage[level]) {
    return categoryImage[level];
  }

  return '/images/defaults/tests/default.html';
}

populateDefaultImages();
